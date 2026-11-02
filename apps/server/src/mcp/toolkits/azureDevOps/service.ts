/**
 * Azure work items behind one small service.
 *
 * The toolkit talks to this instead of to `AzureDevOpsWorkspace` directly: that
 * client is a large object of Effects, and pulling it into the MCP handler types
 * blows up the requirement channel of the assembled layer (the same ceiling the
 * WebSocket RPC group hit). Four narrow methods keep the handler types finite.
 *
 * @module mcp/toolkits/azureDevOps/service
 */

import {
  AzureDevOpsWorkItemLink,
  OrchestratorMcpFailure,
  type AzureDevOpsWorkspaceError,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as AzureDevOpsWorkspace from "../../../azureDevOpsWorkspace.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import type { McpInvocationScope } from "../../McpInvocationContext.ts";
import { findProjectForWorkItem, isActiveState, plainText, summarizeWorkItem } from "./logic.ts";
import type { AzureWorkItemSummary } from "./logic.ts";

const DEFAULT_LIMIT = 25;

export interface AzureWorkItemsResult {
  readonly organization: string;
  readonly items: ReadonlyArray<AzureWorkItemSummary>;
}

export interface AzureWorkItemResult {
  readonly organization: string;
  readonly item: AzureWorkItemSummary;
  readonly description: string | null;
}

export interface AzureLinkResult {
  readonly threadId: ThreadId;
  readonly link: AzureDevOpsWorkItemLink | null;
  readonly item: AzureWorkItemSummary | null;
}

export interface AzureLinkInput {
  readonly id: number;
  readonly project?: string | undefined;
  readonly threadId?: ThreadId | undefined;
}

type Workspace = Effect.Success<typeof AzureDevOpsWorkspace.make>;

function failure(code: OrchestratorMcpFailure["code"], message: string) {
  return new OrchestratorMcpFailure({ code, message });
}

/** Every failure ends as the one error the agent knows how to explain. */
const isMcpFailure = Schema.is(OrchestratorMcpFailure);

function toFailure(error: unknown): OrchestratorMcpFailure {
  if (isMcpFailure(error)) return error;
  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? (error as { _tag: unknown })._tag
      : undefined;
  if (tag === "AzureDevOpsWorkspaceError" || tag === "ServerSettingsError") {
    return failure("orchestration_error", (error as AzureDevOpsWorkspaceError).message);
  }
  return failure("orchestration_error", error instanceof Error ? error.message : String(error));
}

export class AzureWorkItemMcpService extends Context.Service<
  AzureWorkItemMcpService,
  {
    readonly myWorkItems: (input: {
      readonly activeOnly?: boolean | undefined;
      readonly limit?: number | undefined;
    }) => Effect.Effect<AzureWorkItemsResult, OrchestratorMcpFailure>;
    readonly workItem: (input: {
      readonly id: number;
      readonly project?: string | undefined;
    }) => Effect.Effect<AzureWorkItemResult, OrchestratorMcpFailure>;
    readonly link: (
      scope: McpInvocationScope,
      input: AzureLinkInput,
    ) => Effect.Effect<AzureLinkResult, OrchestratorMcpFailure>;
    readonly unlink: (
      scope: McpInvocationScope,
      threadId: ThreadId | undefined,
    ) => Effect.Effect<AzureLinkResult, OrchestratorMcpFailure>;
  }
>()("t3/mcp/toolkits/azureDevOps/service/AzureWorkItemMcpService") {}

/** The project an id belongs to, from the caller's own assignments. */
const resolveProject = (workspace: Workspace, workItemId: number) =>
  workspace.listAssignedWorkItems().pipe(
    Effect.flatMap((items) => {
      const project = findProjectForWorkItem(items, workItemId);
      return project === null
        ? Effect.fail(
            failure(
              "invalid_request",
              `Work item ${workItemId} is not assigned to you, so its project cannot be looked up. Pass project explicitly.`,
            ),
          )
        : Effect.succeed(project);
    }),
  );

/** `actsAsCaller` guarantees a caller; writing for an unknown thread would be a silent no-op. */
function callerThreadId(scope: McpInvocationScope, explicit: ThreadId | undefined): ThreadId {
  const threadId = explicit ?? scope.thread?.threadId;
  if (threadId === undefined) throw failure("invalid_request", "This tool needs a thread.");
  return threadId;
}

export const make = Effect.gen(function* () {
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const workspace = yield* AzureDevOpsWorkspace.make;

  const writeLink = (threadId: ThreadId, link: AzureDevOpsWorkItemLink | null) =>
    Effect.gen(function* () {
      const settings = yield* settingsService.getSettings;
      const links = { ...settings.azureDevOpsThreadLinks };
      if (link === null) delete links[threadId];
      else links[threadId] = link;
      yield* settingsService.updateSettings({ azureDevOpsThreadLinks: links });
    });

  const myWorkItems: AzureWorkItemMcpService["Service"]["myWorkItems"] = (input) =>
    Effect.gen(function* () {
      const config = yield* workspace.config;
      const items = yield* workspace.listAssignedWorkItems();
      const open =
        input.activeOnly === false ? items : items.filter((item) => isActiveState(item.state));
      const limit = Math.max(1, input.limit ?? DEFAULT_LIMIT);
      return {
        organization: config.organization,
        items: open.slice(0, limit).map(summarizeWorkItem),
      };
    }).pipe(Effect.mapError(toFailure));

  const workItem: AzureWorkItemMcpService["Service"]["workItem"] = (input) =>
    Effect.gen(function* () {
      const config = yield* workspace.config;
      const project = input.project ?? (yield* resolveProject(workspace, input.id));
      const item = yield* workspace.getWorkItem(project, input.id);
      return {
        organization: config.organization,
        item: summarizeWorkItem(item),
        description: plainText(item.description),
      };
    }).pipe(Effect.mapError(toFailure));

  const link: AzureWorkItemMcpService["Service"]["link"] = (scope, input) =>
    Effect.gen(function* () {
      const threadId = callerThreadId(scope, input.threadId);
      const config = yield* workspace.config;
      const project = input.project ?? (yield* resolveProject(workspace, input.id));
      const item = yield* workspace.getWorkItem(project, input.id);
      const linkValue: AzureDevOpsWorkItemLink = {
        organization: config.organization,
        project,
        workItemId: item.id,
      };
      yield* writeLink(threadId, linkValue);
      return { threadId, link: linkValue, item: summarizeWorkItem(item) };
    }).pipe(Effect.mapError(toFailure));

  const unlink: AzureWorkItemMcpService["Service"]["unlink"] = (scope, threadId) =>
    Effect.gen(function* () {
      const target = callerThreadId(scope, threadId);
      yield* writeLink(target, null);
      return { threadId: target, link: null, item: null };
    }).pipe(Effect.mapError(toFailure));

  return AzureWorkItemMcpService.of({ myWorkItems, workItem, link, unlink });
});

export const layer = Layer.effect(AzureWorkItemMcpService, make);
