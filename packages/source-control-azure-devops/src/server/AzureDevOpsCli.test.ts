import { afterEach, assert, describe, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import * as TestSourceControlHost from "@t3tools/source-control-testing/TestSourceControlHost";
import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";

const remote = "https://dev.azure.com/acme/project/_git/repository";
const buildLayer = (token = "private-pat") =>
  AzureDevOpsCli.layer.pipe(
    Layer.provide(
      TestSourceControlHost.layer({
        settings: {
          ...DEFAULT_SERVER_SETTINGS,
          sourceControlHosts: {
            "azure-devops": { organization: "acme", personalAccessToken: token },
          },
        },
        git: { readConfigValue: () => Effect.succeed(remote) },
        process: { run: () => Effect.die("Azure CLI must never be started") },
      }),
    ),
  );

afterEach(() => vi.unstubAllGlobals());

describe("Azure DevOps PAT transport", () => {
  it.effect("fetches a PR branch using the same PAT without putting it in Git arguments", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            pullRequestId: 42,
            sourceRefName: "refs/heads/feature/one",
          }),
          { status: 200 },
        ),
      ),
    );
    const runs: Array<{ args: readonly string[]; env?: NodeJS.ProcessEnv }> = [];
    const host = TestSourceControlHost.layer({
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        sourceControlHosts: {
          "azure-devops": { organization: "acme", personalAccessToken: "private-pat" },
        },
      },
      git: {
        readConfigValue: () => Effect.succeed(remote),
        execute: () => Effect.succeed(TestSourceControlHost.processOutput("")),
        switchRef: () => Effect.succeed({ refName: "upcode-pr-42" }),
      },
      process: {
        run: (input) => {
          runs.push({ args: input.args, ...(input.env === undefined ? {} : { env: input.env }) });
          return Effect.succeed(TestSourceControlHost.processOutput(""));
        },
      },
    });
    return Effect.gen(function* () {
      const azure = yield* AzureDevOpsCli.AzureDevOpsCli;
      yield* azure.checkoutPullRequest({ cwd: "/repo", reference: "42" });
      assert.equal(runs.length, 1);
      assert.deepEqual(runs[0]?.args, [
        "-C",
        "/repo",
        "fetch",
        "--no-tags",
        remote,
        "refs/heads/feature/one",
      ]);
      assert.equal(JSON.stringify(runs[0]?.args).includes("private-pat"), false);
      assert.equal(runs[0]?.env?.GIT_CONFIG_KEY_0, "http.https://dev.azure.com/acme/.extraheader");
      assert.equal(
        runs[0]?.env?.GIT_CONFIG_VALUE_0,
        `AUTHORIZATION: Basic ${Buffer.from(":private-pat").toString("base64")}`,
      );
    }).pipe(Effect.provide(AzureDevOpsCli.layer.pipe(Layer.provide(host))));
  });

  it.effect("reads a pull request over REST with Basic PAT authentication", () =>
    Effect.gen(function* () {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            pullRequestId: 42,
            title: "Add Azure provider",
            sourceRefName: "refs/heads/feature/source-control",
            targetRefName: "refs/heads/main",
            status: "active",
            creationDate: "2026-01-02T00:00:00.000Z",
            _links: {
              web: { href: "https://dev.azure.com/acme/project/_git/repository/pullrequest/42" },
            },
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const azure = yield* AzureDevOpsCli.AzureDevOpsCli;
      const result = yield* azure.getPullRequest({ cwd: "/repo", reference: "42" });
      assert.strictEqual(result.number, 42);
      assert.strictEqual(
        fetchMock.mock.calls[0]?.[0],
        "https://dev.azure.com/acme/project/_apis/git/pullrequests/42?includeLinks=true&api-version=7.1",
      );
      const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
      assert.strictEqual(
        headers.Authorization,
        `Basic ${Buffer.from(":private-pat").toString("base64")}`,
      );
      assert.strictEqual(String(fetchMock.mock.calls[0]?.[0]).includes("private-pat"), false);
    }).pipe(Effect.provide(buildLayer())),
  );

  it.effect("rejects a missing PAT before contacting Azure", () =>
    Effect.gen(function* () {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);
      const azure = yield* AzureDevOpsCli.AzureDevOpsCli;
      const failure = yield* azure
        .execute({ cwd: "/repo", args: ["repos", "show"] })
        .pipe(Effect.flip);
      assert.strictEqual(failure._tag, "AzureDevOpsCliAuthenticationError");
      assert.strictEqual(fetchMock.mock.calls.length, 0);
    }).pipe(Effect.provide(buildLayer(""))),
  );

  it.effect("reports PAT rejection without exposing the response body", () =>
    Effect.gen(function* () {
      vi.stubGlobal(
        "fetch",
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("private error detail", { status: 401 })),
      );
      const azure = yield* AzureDevOpsCli.AzureDevOpsCli;
      const failure = yield* azure
        .execute({ cwd: "/repo", args: ["repos", "show"] })
        .pipe(Effect.flip);
      assert.strictEqual(failure._tag, "AzureDevOpsCliAuthenticationError");
      assert.strictEqual(failure.message.includes("private error detail"), false);
    }).pipe(Effect.provide(buildLayer())),
  );
});
