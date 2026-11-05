import { OrchestratorMcpFailure, SubagentId, TrimmedNonEmptyString } from "@upcode/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestratorMcpService from "../../OrchestratorMcpService.ts";

/** Subagent tools live with orchestration because they delegate through it. */
const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  OrchestratorMcpService.OrchestratorMcpService,
  ServerSettings.ServerSettingsService,
];

const SubagentSummary = Schema.Struct({
  id: SubagentId,
  name: TrimmedNonEmptyString,
  prompt: Schema.String.annotate({
    description: "The role's internal instructions, as the user wrote them.",
  }),
  tools: Schema.Array(Schema.String).annotate({
    description: "Tool names the user pinned to this role. Advisory, may be empty.",
  }),
});

/** Named roles the user wrote; global to the environment, not per project. */
export const SubagentListTool = Tool.make("subagent_list", {
  description:
    "List the named subagents (roles) the user has defined in UPCode. Each carries its own internal instructions: role, tone, workflow and rules. They are global, so the same roles are available in every project. Call this before subagent_run when you do not already know which roles exist, and prefer delegating to a role the user wrote over inventing one.",
  success: Schema.Struct({ subagents: Schema.Array(SubagentSummary) }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode · list subagents")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

/**
 * Runs one named role. The composed task carries the role's instructions,
 * because a delegated child never sees this conversation.
 */
export const SubagentRunTool = Tool.make("subagent_run", {
  description:
    "Hand a task to one of the user's named subagents: a child agent runs with that role's internal instructions prepended, in a child thread of this one, without copying this conversation. Use it when the work clearly matches a role the user defined and parallel work would help. Defaults to mode='async', which returns immediately with a taskId — read the result later with task_status. Never invent a role: if no subagent matches, do the work here or use delegate_task.",
  parameters: Schema.Struct({
    subagent: TrimmedNonEmptyString.annotate({
      description: "The subagent's name or id, as returned by subagent_list.",
    }),
    task: TrimmedNonEmptyString.annotate({
      description:
        "Self-contained task for the subagent. It does not see this conversation, so include the context it needs.",
    }),
    mode: Schema.optional(
      Schema.Literals(["async", "wait"]).annotate({
        description:
          "Defaults to async. Use wait only when this turn needs the result before it can continue.",
      }),
    ),
  }),
  success: Schema.Struct({
    subagentId: SubagentId,
    subagentName: TrimmedNonEmptyString,
    taskId: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode · run a subagent")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);
