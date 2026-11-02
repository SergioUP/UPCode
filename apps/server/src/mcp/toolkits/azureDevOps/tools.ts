import {
  AzureDevOpsWorkItemLink,
  OrchestratorMcpFailure,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { AzureWorkItemSummarySchema } from "./logic.ts";
import { AzureWorkItemMcpService } from "./service.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  AzureWorkItemMcpService,
];

const WorkItemTarget = Schema.Struct({
  id: Schema.Int.annotate({
    description: "Azure DevOps work item id, for example 7766.",
  }),
  project: Schema.optional(
    TrimmedNonEmptyString.annotate({
      description:
        "Azure DevOps project name. Omit when the item is one of the caller's own assignments; it is looked up from them.",
    }),
  ),
});

const MyWorkItemsResult = Schema.Struct({
  organization: Schema.String,
  items: Schema.Array(AzureWorkItemSummarySchema),
});

const WorkItemResult = Schema.Struct({
  organization: Schema.String,
  item: AzureWorkItemSummarySchema,
  description: Schema.NullOr(Schema.String),
});

const LinkResult = Schema.Struct({
  threadId: ThreadId,
  /** Null after unlinking. */
  link: Schema.NullOr(AzureDevOpsWorkItemLink),
  item: Schema.NullOr(AzureWorkItemSummarySchema),
});

export const AzureMyWorkItemsTool = Tool.make("azure_devops_my_work_items", {
  description:
    "List the Azure DevOps work items assigned to the person whose PAT this server holds, newest first. Use it to resolve what the user means by 'my current task' instead of asking for a number. By default only open items are returned (Closed/Done/Removed/Completed are left out). Never pick one of several active items on your own: if more than one looks like the task the user means, ask which id it is.",
  parameters: Schema.Struct({
    activeOnly: Schema.optional(
      Schema.Boolean.annotate({
        description: "Return only items whose state is not Closed, Done, Removed or Completed.",
      }),
    ),
    limit: Schema.optional(
      Schema.Int.annotate({
        description: "How many items to return at most, newest first. Defaults to 25.",
      }),
    ),
  }),
  success: MyWorkItemsResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "List my Azure DevOps work items")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const AzureWorkItemTool = Tool.make("azure_devops_work_item", {
  description:
    "Read one Azure DevOps work item: title, type, state, sprint, area, assignee, url and a plain-text excerpt of its description. Use it to learn what a task is about before working on it.",
  parameters: WorkItemTarget,
  success: WorkItemResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Read an Azure DevOps work item")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const AzureLinkThreadTool = Tool.make("azure_devops_link_thread", {
  description:
    "Link this agent thread to an Azure DevOps work item, which is what the thread header and the thread card show. Omit threadId for the current thread. The project is looked up from the caller's own assignments when not given; if the item is not assigned to them, pass project explicitly. Linking replaces any previous link. This does not change anything in Azure DevOps.",
  parameters: Schema.Struct({
    ...WorkItemTarget.fields,
    threadId: Schema.optional(
      ThreadId.annotate({ description: "Thread to link. Omit for this thread." }),
    ),
  }),
  success: LinkResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Link this thread to a work item")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const AzureUnlinkThreadTool = Tool.make("azure_devops_unlink_thread", {
  description:
    "Remove the Azure DevOps work item linked to a thread without touching Azure DevOps itself. Omit threadId for the current thread.",
  parameters: Schema.Struct({
    threadId: Schema.optional(
      ThreadId.annotate({ description: "Thread to unlink. Omit for this thread." }),
    ),
  }),
  success: LinkResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "Unlink the thread's work item")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const AzureDevOpsToolkit = Toolkit.make(
  AzureMyWorkItemsTool,
  AzureWorkItemTool,
  AzureLinkThreadTool,
  AzureUnlinkThreadTool,
);
