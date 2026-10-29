import { afterEach, assert, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as ServerSettings from "./serverSettings.ts";
import * as AzureDevOpsWorkspace from "./azureDevOpsWorkspace.ts";

afterEach(() => vi.unstubAllGlobals());

it.effect("loads assigned work across projects in batches without the 100-item cutoff", () =>
  Effect.gen(function* () {
    const batches: number[][] = [];
    let query = "";
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (String(url).includes("/wiql")) {
          query = body.query;
          return new Response(
            JSON.stringify({ workItems: Array.from({ length: 205 }, (_, i) => ({ id: i + 1 })) }),
          );
        }
        if (String(url).includes("workitemsbatch")) batches.push(body.ids);
        return new Response(JSON.stringify({ value: [] }));
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    yield* workspace.listWorkItems(undefined, true, undefined, "Sub Tarea");
    assert.isTrue(query.includes("[System.AssignedTo] = @Me"));
    assert.deepStrictEqual(
      batches.map((batch) => batch.length),
      [200, 5],
    );
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

const pullRequestUrl = "https://dev.azure.com/upango/Shopify/_git/UPG.Pataky/pullrequest/7";

/** The two reads every extras call ends with, plus the repository lookup that resolves the URL. */
const extrasResponses = (target: string) => {
  if (target.includes("/git/repositories?"))
    return { value: [{ id: "repo-guid", name: "UPG.Pataky" }] };
  if (target.includes("/workitems")) return [{ id: "123" }];
  if (target.includes("/reviewers")) return [{ id: "reviewer-guid", displayName: "Ana" }];
  return null;
};

it.effect("links a work item to the pull request named by its URL", () =>
  Effect.gen(function* () {
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        const target = String(url);
        calls.push({ method: String(init?.method ?? "GET"), url: target });
        return new Response(JSON.stringify(extrasResponses(target)), { status: 200 });
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const extras = yield* workspace.updatePullRequestExtras({
      pullRequestUrl,
      workItem: { id: 123, linked: true },
    });
    const link = calls.find((call) => call.url.includes("/pullrequests/7/workitems/123"));
    assert.strictEqual(link?.method, "POST");
    assert.isTrue(calls.some((call) => call.url.includes("/git/repositories?api-version=")));
    assert.deepStrictEqual(extras.linkedWorkItemIds, [123]);
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

it.effect("asks somebody for a review with a zero vote and returns the reviewers", () =>
  Effect.gen(function* () {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        const target = String(url);
        calls.push({
          method: String(init?.method ?? "GET"),
          url: target,
          body: init?.body === undefined ? null : JSON.parse(String(init.body)),
        });
        return new Response(JSON.stringify(extrasResponses(target)), { status: 200 });
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const extras = yield* workspace.updatePullRequestExtras({
      pullRequestUrl,
      reviewer: { id: "reviewer-guid", requested: true },
    });
    const request = calls.find((call) => call.url.includes("/reviewers/reviewer-guid"));
    assert.strictEqual(request?.method, "PUT");
    assert.deepStrictEqual(request?.body, { vote: 0 });
    assert.deepStrictEqual(
      extras.reviewers.map((reviewer) => reviewer.id),
      ["reviewer-guid"],
    );
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

it.effect("refuses a pull request URL from another organization without calling the host", () =>
  Effect.gen(function* () {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const workspace = yield* AzureDevOpsWorkspace.make;
    const failure = yield* workspace
      .pullRequestExtras("https://dev.azure.com/otra/Shopify/_git/UPG.Pataky/pullrequest/7")
      .pipe(Effect.flip);
    assert.strictEqual(failure.reason, "configuration");
    assert.isTrue(failure.message.includes("otra"));
    assert.strictEqual(fetchMock.mock.calls.length, 0);
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

it.effect("does not search the identity API for a one-character query", () =>
  Effect.gen(function* () {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        calls.push(String(url));
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "reviewer-guid",
                displayName: "Ana",
                properties: { Account: { $value: "ana@upango.es" } },
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    assert.deepStrictEqual(yield* workspace.reviewerCandidates("a"), []);
    assert.strictEqual(calls.length, 0);
    const candidates = yield* workspace.reviewerCandidates("ana");
    assert.isTrue(calls[0]?.startsWith("https://vssps.dev.azure.com/upango/_apis/identities?"));
    assert.deepStrictEqual(candidates, [
      { id: "reviewer-guid", displayName: "Ana", email: "ana@upango.es" },
    ]);
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
