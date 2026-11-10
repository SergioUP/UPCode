import { afterEach, assert, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as ServerSettings from "./serverSettings.ts";
import * as AzureDevOpsWorkspace from "./azureDevOpsWorkspace.ts";
import * as AzureDevOpsAzCli from "./azureDevOpsAzCli.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.effect("does not report connected when the configured credential is rejected", () =>
  Effect.gen(function* () {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 })),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const failure = yield* Effect.flip(workspace.config);
    assert.strictEqual(failure.reason, "authentication");
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "invalid-pat" },
        },
      }),
    ),
  ),
);

it.effect("uses the Azure CLI resource token when no PAT is configured", () =>
  Effect.gen(function* () {
    vi.spyOn(AzureDevOpsAzCli, "getAccessToken").mockReturnValue(Effect.succeed("resource-token"));
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      assert.strictEqual(
        (init?.headers as Record<string, string> | undefined)?.Authorization,
        "Bearer resource-token",
      );
      return new Response(JSON.stringify({ value: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const workspace = yield* AzureDevOpsWorkspace.make;
    assert.deepStrictEqual(yield* workspace.config, { organization: "upango", connected: true });
    assert.strictEqual(fetchMock.mock.calls.length, 1);
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "" },
        },
      }),
    ),
  ),
);

it.effect("loads all active PR pages with review votes and creation dates", () =>
  Effect.gen(function* () {
    const offsets: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        const offset = new URL(String(url)).searchParams.get("$skip") ?? "0";
        offsets.push(offset);
        const count = offset === "0" ? 100 : 1;
        return new Response(
          JSON.stringify({
            value: Array.from({ length: count }, (_, index) => ({
              pullRequestId: Number(offset) + index + 1,
              repository: { id: "repo-id", name: "Web" },
              creationDate: "2026-11-10T10:00:00Z",
              reviewers: [{ displayName: "Revisora", vote: 10, isRequired: true }],
            })),
          }),
          {
            headers: { "X-VSS-UserData": "c6c7b32c-cdca-61d3-8a1a-d2b19b6ccac9:sergio@upango.es" },
          },
        );
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const prs = yield* workspace.listPullRequests("Project with spaces");
    assert.strictEqual(prs.length, 101);
    assert.deepStrictEqual(offsets, ["0", "100"]);
    assert.strictEqual(prs[100]?.id, 101);
    assert.strictEqual(prs[0]?.createdAt, "2026-11-10T10:00:00Z");
    assert.deepStrictEqual(prs[0]?.reviewers, [{ name: "Revisora", vote: 10, required: true }]);
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "private-pat" },
        },
      }),
    ),
  ),
);

it.effect("recognises the viewer from the response header so `mine` works with a PAT", () =>
  Effect.gen(function* () {
    const viewer = "c6c7b32c-cdca-61d3-8a1a-d2b19b6ccac9";
    const calls: Array<{ url: string; authorization: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
        calls.push({
          url: String(url),
          authorization: String(
            (init?.headers as Record<string, string> | undefined)?.Authorization,
          ),
        });
        const repository = { id: "repo-id", name: "Web" };
        return new Response(
          JSON.stringify({
            value: [
              { pullRequestId: 1, repository, createdBy: { id: viewer, displayName: "Sergio" } },
              {
                pullRequestId: 2,
                repository,
                createdBy: { id: "otra-persona" },
                reviewers: [{ id: viewer, displayName: "Sergio" }],
              },
              { pullRequestId: 3, repository, createdBy: { id: "otra-persona" }, reviewers: [] },
            ],
          }),
          { headers: { "X-VSS-UserData": `${viewer}:sergio@upango.es` } },
        );
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const prs = yield* workspace.listPullRequests("Shopify");
    assert.deepStrictEqual(
      prs.map((pr) => pr.involvesViewer),
      [true, true, false],
    );
    // The header travels with the PR page: no connectionData round trip, no az CLI.
    assert.isTrue(calls.every((call) => !call.url.includes("connectionData")));
    assert.isTrue(
      calls.every(
        (call) => call.authorization === `Basic ${Buffer.from(":private-pat").toString("base64")}`,
      ),
    );
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "private-pat" },
        },
      }),
    ),
  ),
);

it.effect("asks connectionData for the preview version when a proxy strips the header", () =>
  Effect.gen(function* () {
    const viewer = "c6c7b32c-cdca-61d3-8a1a-d2b19b6ccac9";
    const connectionUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(async (url) => {
        const target = String(url);
        if (target.includes("connectionData")) {
          connectionUrls.push(target);
          return new Response(
            JSON.stringify({ authenticatedUser: { id: viewer, providerDisplayName: "Sergio" } }),
          );
        }
        return new Response(
          JSON.stringify({
            value: [
              {
                pullRequestId: 7,
                repository: { id: "repo-id", name: "Web" },
                createdBy: { id: viewer, displayName: "Sergio" },
              },
            ],
          }),
        );
      }),
    );
    const workspace = yield* AzureDevOpsWorkspace.make;
    const prs = yield* workspace.listPullRequests("Shopify");
    assert.strictEqual(prs[0]?.involvesViewer, true);
    assert.strictEqual(connectionUrls.length, 1);
    // The plain 7.1 version answers HTTP 400 for connectionData.
    assert.isTrue(connectionUrls[0]?.includes("api-version=7.1-preview.1"));
  }).pipe(
    Effect.provide(
      ServerSettings.layerTest({
        sourceControlHosts: {
          "azure-devops": { organization: "upango", personalAccessToken: "private-pat" },
        },
      }),
    ),
  ),
);

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
