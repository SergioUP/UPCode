import { afterEach, assert, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as ServerSettings from "./serverSettings.ts";
import * as AzureDevOpsWorkspace from "./azureDevOpsWorkspace.ts";

afterEach(() => vi.unstubAllGlobals());

it.effect("reads PR work item links and blocking policies through the configured PAT", () =>
  Effect.gen(function* () {
    const calls: Array<{ url: string; authorization: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        calls.push({
          url: String(url),
          authorization: String((init?.headers as Record<string, string>)?.Authorization),
        });
        const target = String(url);
        const body = target.includes("/_apis/projects/")
          ? { id: "project-guid" }
          : target.includes("/workitems?")
            ? [{ id: "123" }]
            : target.includes("/policy/evaluations?")
              ? [
                  {
                    status: "approved",
                    configuration: { isBlocking: true, type: { displayName: "Build" } },
                  },
                ]
              : { status: "active" };
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const detail = yield* workspace.getPullRequestDetail("Shopify", "repo-guid", 42);
    assert.deepStrictEqual(detail.linkedWorkItemIds, [123]);
    assert.strictEqual(detail.qualityGate.outcome, "approved");
    assert.strictEqual(calls.length, 4);
    assert.isTrue(
      calls.every(
        (call) => call.authorization === `Basic ${Buffer.from(":secret-pat").toString("base64")}`,
      ),
    );
    assert.isTrue(calls.every((call) => !call.url.includes("secret-pat")));
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "secret-pat" },
        },
      }),
    ),
  ),
);

it.effect("searches work items by id or escaped title through WIQL", () =>
  Effect.gen(function* () {
    const wiqlFor = (query: string | undefined) =>
      Effect.gen(function* () {
        let body = "";
        vi.stubGlobal(
          "fetch",
          vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
            if (String(url).includes("/wit/wiql")) body = String(init?.body ?? "");
            return new Response(JSON.stringify({ workItems: [] }), { status: 200 });
          }),
        );
        const workspace = yield* AzureDevOpsWorkspace.make;
        yield* workspace.listWorkItems("Shopify", false, query);
        return body;
      });
    const byId = yield* wiqlFor("7244");
    assert.isTrue(byId.includes(" AND [System.Id] = 7244"));
    assert.isFalse(byId.includes("CONTAINS"));
    const byTitle = yield* wiqlFor("o'brien");
    assert.isTrue(byTitle.includes(" AND [System.Title] CONTAINS 'o''brien'"));
    const plain = yield* wiqlFor(undefined);
    assert.isFalse(plain.includes("CONTAINS"));
    assert.isFalse(plain.includes("[System.Id] ="));
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "secret-pat" },
        },
      }),
    ),
  ),
);
