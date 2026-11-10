import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import * as TestSourceControlHost from "@t3tools/source-control-testing/TestSourceControlHost";
import * as SourceControlHost from "@t3tools/source-control-core/server/SourceControlHost";
import { makeAzureDevOpsRestTransport, parseAzureRemote } from "./AzureDevOpsRestTransport.ts";

afterEach(() => vi.unstubAllGlobals());

it.effect.each(["pat", "cli"] as const)(
  "reads remote PR detail without an Azure checkout using %s",
  (mode) =>
    Effect.gen(function* () {
      const calls: Array<{ url: string; authorization: string }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
          calls.push({
            url: String(url),
            authorization:
              (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
          });
          return new Response(JSON.stringify({ pullRequestId: 42 }));
        }),
      );
      const host = yield* SourceControlHost.SourceControlHost;
      const transport = makeAzureDevOpsRestTransport(host);
      yield* transport.execute({
        cwd: "/github-checkout",
        args: ["repos", "pr", "show", "--id", "42"],
      });
      expect(calls).toEqual([
        {
          url: "https://dev.azure.com/upango/_apis/git/pullrequests/42?includeLinks=true&api-version=7.1",
          authorization:
            mode === "pat"
              ? `Basic ${Buffer.from(":secret").toString("base64")}`
              : "Bearer cli-resource-token",
        },
      ]);
    }).pipe(
      Effect.provide(
        TestSourceControlHost.layer({
          settings: {
            ...DEFAULT_SERVER_SETTINGS,
            sourceControlHosts: {
              "azure-devops": {
                organization: "upango",
                personalAccessToken: mode === "pat" ? "secret" : "",
              },
            },
          },
          git: { readConfigValue: () => Effect.succeed("https://github.com/acme/app.git") },
          process: {
            run: (input) => {
              expect(input.args.slice(0, 2)).toEqual(["account", "get-access-token"]);
              return Effect.succeed(TestSourceControlHost.processOutput("cli-resource-token"));
            },
          },
        }),
      ),
    ),
);

it.effect("asks connectionData on its preview version when listing the viewer's PRs", () =>
  Effect.gen(function* () {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        const target = String(url);
        urls.push(target);
        return new Response(
          JSON.stringify(
            target.includes("connectionData")
              ? { authenticatedUser: { id: "viewer-id", uniqueName: "sergio@upango.es" } }
              : { value: [] },
          ),
        );
      }),
    );
    const host = yield* SourceControlHost.SourceControlHost;
    const transport = makeAzureDevOpsRestTransport(host);
    yield* transport.execute({
      cwd: "/azure-checkout",
      args: ["repos", "pr", "list", "--creator", "me"],
    });
    // The plain 7.1 version answers HTTP 400 for connectionData.
    expect(urls[0]).toBe(
      "https://dev.azure.com/upango/_apis/connectionData?api-version=7.1-preview.1",
    );
    expect(urls[1]).toContain("searchCriteria.creatorId=viewer-id");
  }).pipe(
    Effect.provide(
      TestSourceControlHost.layer({
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          sourceControlHosts: {
            "azure-devops": { organization: "upango", personalAccessToken: "secret" },
          },
        },
        git: {
          readConfigValue: () => Effect.succeed("https://dev.azure.com/upango/Shopify/_git/Web"),
        },
      }),
    ),
  ),
);

it.effect("lists the viewer's pull requests through REST, with no az CLI in the path", () =>
  Effect.gen(function* () {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        const target = String(url);
        urls.push(target);
        return new Response(
          JSON.stringify(
            target.includes("connectionData")
              ? { authenticatedUser: { id: "viewer-id" } }
              : { value: [] },
          ),
        );
      }),
    );
    const host = yield* SourceControlHost.SourceControlHost;
    const transport = makeAzureDevOpsRestTransport(host);
    yield* transport.execute({
      cwd: "/azure-checkout",
      args: [
        "repos",
        "pr",
        "list",
        "--detect",
        "true",
        "--repository",
        "Web",
        "--creator",
        "me",
        "--status",
        "active",
        "--include-links",
        "--top",
        "5",
      ],
    });
    const list = urls.at(-1) ?? "";
    expect(list).toContain(
      "https://dev.azure.com/upango/Shopify/_apis/git/repositories/Web/pullrequests",
    );
    expect(list).toContain("searchCriteria.status=active");
    expect(list).toContain("searchCriteria.creatorId=viewer-id");
    expect(list).toContain("%24top=5");
    expect(list).toContain("includeLinks=true");
  }).pipe(
    Effect.provide(
      TestSourceControlHost.layer({
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          sourceControlHosts: {
            "azure-devops": { organization: "upango", personalAccessToken: "secret" },
          },
        },
        git: {
          readConfigValue: () => Effect.succeed("https://dev.azure.com/upango/Shopify/_git/Web"),
        },
      }),
    ),
  ),
);

describe("Azure DevOps remote resolution for PAT REST calls", () => {
  it("reads an HTTPS remote with encoded project and repository names", () => {
    expect(
      parseAzureRemote(
        "https://dev.azure.com/upango/UPG%20-%20Portal%20Empleado/_git/Portal%20Web",
      ),
    ).toEqual({
      organization: "upango",
      project: "UPG - Portal Empleado",
      repository: "Portal Web",
    });
  });

  it("reads an SSH remote without requiring Azure CLI", () => {
    expect(parseAzureRemote("git@ssh.dev.azure.com:v3/upango/Shopify/Integrator.git")).toEqual({
      organization: "upango",
      project: "Shopify",
      repository: "Integrator",
    });
  });

  it("rejects non Azure remotes", () => {
    expect(parseAzureRemote("https://github.com/SergioUP/UPCode.git")).toBeNull();
  });
});
