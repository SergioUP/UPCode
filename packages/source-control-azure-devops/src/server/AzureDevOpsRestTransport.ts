// @effect-diagnostics globalFetch:off globalTimers:off -- This isolated REST adapter uses native fetch so its PAT never enters the subprocess environment.
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/process";
import { readSourceControlHostSettings } from "@t3tools/source-control-core/client/definition";
import type * as SourceControlHost from "@t3tools/source-control-core/server/SourceControlHost";
import { settings as azureSettings } from "../client/definition.ts";

const API_VERSION = "7.1";
/** `connectionData` answers HTTP 400 on the plain version; it only exists as a preview. */
const CONNECTION_DATA_VERSION = "7.1-preview.1";
const timeoutMs = 30_000;

/** No request URL or error body is included in messages: either may contain private data. */
export class AzureDevOpsRestTransportError extends Error {
  readonly reason:
    | "configuration"
    | "authentication"
    | "forbidden"
    | "not-found"
    | "rate-limited"
    | "failed";
  readonly status: number | undefined;
  constructor(reason: AzureDevOpsRestTransportError["reason"], status?: number) {
    super(
      `Azure DevOps request failed (${reason}${status === undefined ? "" : `, HTTP ${status}`}).`,
    );
    this.reason = reason;
    this.status = status;
  }
}

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const stringifyJson = (value: unknown): string => JSON.stringify(value);
const loadDescription = async (path: string): Promise<string> => {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
};

async function fetchText(input: {
  url: string;
  method: string;
  authorization: string;
  body?: unknown;
  maxOutputBytes: number;
}): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        Authorization: input.authorization,
        Accept: "application/json",
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: stringifyJson(input.body) }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: response.status, ok: false, text: "" };
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > input.maxOutputBytes)
      throw new AzureDevOpsRestTransportError("failed");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > input.maxOutputBytes)
      throw new AzureDevOpsRestTransportError("failed");
    return { status: response.status, ok: true, text };
  } finally {
    clearTimeout(timer);
  }
}

export interface AzureLocation {
  organization: string;
  project: string;
  repository: string;
}

export function parseAzureRemote(remote: string): AzureLocation | null {
  const ssh = /(?:^|@)ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/i.exec(remote);
  if (ssh)
    return { organization: ssh[1]!, project: ssh[2]!, repository: ssh[3]!.replace(/\.git$/i, "") };
  try {
    const url = new URL(remote);
    if (url.hostname.toLowerCase() === "dev.azure.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 4 && parts[2] === "_git")
        return {
          organization: parts[0]!,
          project: decodeURIComponent(parts[1]!),
          repository: decodeURIComponent(parts[3]!),
        };
    }
    if (url.hostname.toLowerCase().endsWith(".visualstudio.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 3 && parts[1] === "_git")
        return {
          organization: url.hostname.split(".")[0]!,
          project: decodeURIComponent(parts[0]!),
          repository: decodeURIComponent(parts[2]!),
        };
    }
  } catch {
    /* Invalid remote. */
  }
  return null;
}

function option(args: readonly string[], flag: string): string | undefined {
  const exact = args.indexOf(flag);
  if (exact >= 0) return args[exact + 1];
  return args.find((part) => part.startsWith(`${flag}=`))?.slice(flag.length + 1);
}

function query(values: Record<string, string | undefined>, version = API_VERSION): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) params.set(key, value);
  params.set("api-version", version);
  return `?${params.toString()}`;
}

function statusReason(status: number): AzureDevOpsRestTransportError["reason"] {
  if (status === 401) return "authentication";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 429) return "rate-limited";
  return "failed";
}

export function makeAzureDevOpsRestTransport(host: SourceControlHost.SourceControlHost["Service"]) {
  const locationFor = (cwd: string) =>
    Effect.gen(function* () {
      const remote = yield* host.git.readConfigValue(cwd, "remote.origin.url");
      const location = remote === null ? null : parseAzureRemote(remote);
      if (location === null) {
        const settings = yield* host.settings.get;
        const credential = readSourceControlHostSettings(
          azureSettings,
          settings.sourceControlHosts["azure-devops"],
        );
        if (!credential.organization)
          return yield* Effect.fail(new AzureDevOpsRestTransportError("configuration"));
        // PR ids are organization-wide. Explicit invoke routes carry their own project/repository.
        return { organization: credential.organization, project: "", repository: "" };
      }
      return location;
    });

  const request = (input: {
    cwd: string;
    path: string;
    method?: string;
    body?: unknown;
    maxOutputBytes?: number;
    service?: "devops" | "identities";
  }) =>
    Effect.gen(function* () {
      const location = yield* locationFor(input.cwd);
      const allSettings = yield* host.settings.get;
      const credential = readSourceControlHostSettings(
        azureSettings,
        allSettings.sourceControlHosts["azure-devops"],
      );
      const pat = credential.personalAccessToken;
      if (
        !credential.organization ||
        credential.organization.toLowerCase() !== location.organization.toLowerCase()
      )
        return yield* Effect.fail(new AzureDevOpsRestTransportError("configuration"));
      const organization = credential.organization;
      const authorization = pat
        ? `Basic ${Buffer.from(`:${pat}`, "utf8").toString("base64")}`
        : yield* host.process
            .run({
              operation: "azureDevOpsAccessToken",
              command: "az",
              cwd: input.cwd,
              args: [
                "account",
                "get-access-token",
                "--resource",
                "499b84ac-1321-427f-aa17-267ca6975798",
                "--query",
                "accessToken",
                "--output",
                "tsv",
                "--only-show-errors",
              ],
              timeoutMs: 8_000,
              maxOutputBytes: 32_768,
            })
            .pipe(
              Effect.mapError(() => new AzureDevOpsRestTransportError("authentication")),
              Effect.flatMap((result) =>
                result.stdout.trim()
                  ? Effect.succeed(`Bearer ${result.stdout.trim()}`)
                  : Effect.fail(new AzureDevOpsRestTransportError("authentication")),
              ),
            );
      const base = `https://${input.service === "identities" ? "vssps.dev.azure.com" : "dev.azure.com"}/${encodeURIComponent(organization)}`;
      const path = input.path
        .replaceAll("{project}", encodeURIComponent(location.project))
        .replaceAll("{repository}", encodeURIComponent(location.repository));
      const response = yield* Effect.tryPromise({
        try: () =>
          fetchText({
            url: `${base}${path}`,
            method: input.method ?? "GET",
            authorization,
            body: input.body,
            maxOutputBytes: input.maxOutputBytes ?? 16 * 1024 * 1024,
          }),
        catch: (cause) =>
          cause instanceof AzureDevOpsRestTransportError
            ? cause
            : new AzureDevOpsRestTransportError("failed"),
      });
      if (!response.ok)
        return yield* Effect.fail(
          new AzureDevOpsRestTransportError(statusReason(response.status), response.status),
        );
      return response.text;
    });

  const execute = (input: {
    cwd: string;
    args: readonly string[];
    maxOutputBytes?: number;
    /** A write travels with its verb and JSON body; reads stay GET. */
    method?: string;
    body?: unknown;
  }) =>
    Effect.gen(function* () {
      const args = input.args;
      const prefix = args.slice(0, 3).join(" ");
      const location = yield* locationFor(input.cwd);
      const requestedRepository = option(args, "--repository");
      const repositoryParts = requestedRepository?.split("/").filter(Boolean) ?? [];
      const project = encodeURIComponent(
        option(args, "--project") ??
          (repositoryParts.length > 1 ? repositoryParts.at(-2)! : location.project),
      );
      const repository = encodeURIComponent(repositoryParts.at(-1) ?? location.repository);
      let raw: string;
      if (args[0] === "devops" && args[1] === "invoke") {
        const resource = option(args, "--resource");
        const routeStart = args.indexOf("--route-parameters");
        const queryStart = args.indexOf("--query-parameters");
        const routeParts =
          routeStart < 0 ? [] : args.slice(routeStart + 1, queryStart < 0 ? undefined : queryStart);
        const route = Object.fromEntries(
          routeParts
            .filter((part) => part.includes("="))
            .map((part) => {
              const at = part.indexOf("=");
              return [part.slice(0, at), part.slice(at + 1)];
            }),
        );
        const params = Object.fromEntries(
          (queryStart < 0 ? [] : args.slice(queryStart + 1))
            .filter((part) => part.includes("="))
            .map((part) => {
              const at = part.indexOf("=");
              return [part.slice(0, at), part.slice(at + 1)];
            }),
        );
        const p = encodeURIComponent(route.project ?? location.project);
        const r = encodeURIComponent(route.repositoryId ?? location.repository);
        const pr = encodeURIComponent(route.pullRequestId ?? "");
        const suffix =
          resource === "pullRequestThreads"
            ? `pullRequests/${pr}/threads`
            : resource === "pullRequestThreadComments"
              ? `pullRequests/${pr}/threads/${encodeURIComponent(route.threadId ?? "")}/comments`
              : resource === "pullRequestThread"
                ? `pullRequests/${pr}/threads/${encodeURIComponent(route.threadId ?? "")}`
                : resource === "pullRequestIterations"
                  ? `pullRequests/${pr}/iterations`
                  : resource === "pullRequestIterationChanges"
                    ? `pullRequests/${pr}/iterations/${encodeURIComponent(route.iterationId ?? "")}/changes`
                    : resource === "items"
                      ? "items"
                      : null;
        if (suffix === null) return yield* Effect.fail(new AzureDevOpsRestTransportError("failed"));
        raw = yield* request({
          ...input,
          path: `/${p}/_apis/git/repositories/${r}/${suffix}${query(params)}`,
        });
      } else if (args[0] === "account" && args[1] === "show") {
        const connection = parseJson<{ authenticatedUser?: { uniqueName?: string } }>(
          yield* request({
            ...input,
            path: `/_apis/connectionData${query({}, CONNECTION_DATA_VERSION)}`,
          }),
        );
        raw = stringifyJson({ name: connection.authenticatedUser?.uniqueName ?? null });
      } else if (prefix === "repos pr list") {
        const status = option(args, "--status");
        const creator = option(args, "--creator");
        const reviewer = option(args, "--reviewer");
        const lookup = (value: string) =>
          request({
            ...input,
            service: "identities",
            path: `/_apis/identities${query({ searchFilter: "General", filterValue: value })}`,
          }).pipe(
            Effect.map((raw) => parseJson<{ value?: Array<{ id?: string }> }>(raw).value?.[0]?.id),
          );
        const viewer =
          creator === "me"
            ? parseJson<{ authenticatedUser?: { id?: string } }>(
                yield* request({
                  ...input,
                  path: `/_apis/connectionData${query({}, CONNECTION_DATA_VERSION)}`,
                }),
              )
            : null;
        const creatorId =
          creator === "me"
            ? viewer?.authenticatedUser?.id
            : creator
              ? yield* lookup(creator)
              : undefined;
        const reviewerId = reviewer ? yield* lookup(reviewer) : undefined;
        const source = option(args, "--source-branch");
        const path = `/${project}/_apis/git/repositories/${repository}/pullrequests${query({ "searchCriteria.status": status === "all" ? undefined : status, "searchCriteria.creatorId": creatorId, "searchCriteria.reviewerId": reviewerId, "searchCriteria.sourceRefName": source ? (source.startsWith("refs/heads/") ? source : `refs/heads/${source}`) : undefined, $top: option(args, "--top"), $skip: option(args, "--skip"), includeLinks: "true" })}`;
        const answer = parseJson<{ value?: unknown[] }>(yield* request({ ...input, path }));
        raw = stringifyJson(answer.value ?? []);
      } else if (prefix === "repos pr show") {
        const id = encodeURIComponent(option(args, "--id") ?? "");
        raw = yield* request({
          ...input,
          path: `${project ? `/${project}` : ""}/_apis/git/pullrequests/${id}${query({ includeLinks: "true" })}`,
        });
      } else if (prefix === "repos pr create") {
        const title = option(args, "--title");
        const body = option(args, "--description");
        const source = option(args, "--source-branch");
        const target = option(args, "--target-branch");
        if (!title || !source || !target)
          return yield* Effect.fail(new AzureDevOpsRestTransportError("configuration"));
        const description = body?.startsWith("@")
          ? yield* Effect.tryPromise({
              try: () => loadDescription(body.slice(1)),
              catch: () => new AzureDevOpsRestTransportError("failed"),
            })
          : (body ?? "");
        const ref = (value: string) =>
          value.startsWith("refs/heads/") ? value : `refs/heads/${value}`;
        raw = yield* request({
          ...input,
          path: `/${project}/_apis/git/repositories/${repository}/pullrequests${query({})}`,
          method: "POST",
          body: { title, description, sourceRefName: ref(source), targetRefName: ref(target) },
        });
      } else if (prefix === "repos pr update") {
        const id = encodeURIComponent(option(args, "--id") ?? "");
        const status = option(args, "--status");
        const draft = option(args, "--draft");
        const autoComplete = option(args, "--auto-complete");
        const squash = option(args, "--squash");
        const body: Record<string, unknown> = {};
        if (status) body.status = status;
        if (draft) body.isDraft = draft === "true";
        if (option(args, "--title") !== undefined) body.title = option(args, "--title");
        if (option(args, "--description") !== undefined)
          body.description = option(args, "--description");
        if (squash !== undefined) body.completionOptions = { squashMerge: squash === "true" };
        if (autoComplete !== undefined) {
          const connection = parseJson<{ authenticatedUser?: { id?: string } }>(
            yield* request({
              ...input,
              path: `/_apis/connectionData${query({}, CONNECTION_DATA_VERSION)}`,
            }),
          );
          if (autoComplete === "true" && !connection.authenticatedUser?.id)
            return yield* Effect.fail(new AzureDevOpsRestTransportError("failed"));
          body.autoCompleteSetBy =
            autoComplete === "true" ? { id: connection.authenticatedUser!.id } : null;
        }
        raw = yield* request({
          ...input,
          path: `/${project}/_apis/git/repositories/${repository}/pullrequests/${id}${query({})}`,
          method: "PATCH",
          body,
        });
      } else if (prefix === "repos pr reviewer") {
        const id = encodeURIComponent(option(args, "--id") ?? "");
        const reviewersAt = args.indexOf("--reviewers");
        const nextFlag =
          reviewersAt < 0
            ? -1
            : args.findIndex((part, index) => index > reviewersAt && part.startsWith("--"));
        const reviewers =
          reviewersAt < 0 ? [] : args.slice(reviewersAt + 1, nextFlag < 0 ? undefined : nextFlag);
        for (const reviewer of reviewers) {
          const identityAnswer = parseJson<{ value?: Array<{ id?: string }> }>(
            yield* request({
              ...input,
              service: "identities",
              path: `/_apis/identities${query({ searchFilter: "General", filterValue: reviewer })}`,
            }),
          );
          const identityId = identityAnswer.value?.[0]?.id;
          if (!identityId)
            return yield* Effect.fail(new AzureDevOpsRestTransportError("not-found"));
          raw = yield* request({
            ...input,
            path: `/${project}/_apis/git/repositories/${repository}/pullrequests/${id}/reviewers/${encodeURIComponent(identityId)}${query({})}`,
            method: args[3] === "add" ? "PUT" : "DELETE",
            ...(args[3] === "add" ? { body: { id: identityId } } : {}),
          });
        }
        raw = "{}";
      } else if (args[0] === "repos" && args[1] === "show") {
        raw = yield* request({
          ...input,
          path: `/${project}/_apis/git/repositories/${repository}${query({})}`,
        });
      } else if (args[0] === "repos" && args[1] === "create") {
        const name = option(args, "--name");
        if (!name) return yield* Effect.fail(new AzureDevOpsRestTransportError("configuration"));
        raw = yield* request({
          ...input,
          path: `/${project}/_apis/git/repositories${query({})}`,
          method: "POST",
          body: { name, project: { name: option(args, "--project") ?? location.project } },
        });
      } else {
        return yield* Effect.fail(new AzureDevOpsRestTransportError("failed"));
      }
      return {
        exitCode: ChildProcessSpawner.ExitCode(0),
        stdout: raw,
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      };
    });
  return { request, execute, locationFor };
}
