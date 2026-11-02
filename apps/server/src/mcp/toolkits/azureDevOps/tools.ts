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
        "Azure DevOps project name, for example 'UPANGO PROYECTOS INTERNOS'. Omit when the item is one of the caller's own assignments: it is looked up from them. Pass it when the item is not assigned to this user.",
    }),
  ),
});

const Organization = Schema.String.annotate({
  description: "Azure DevOps organization the server is configured with.",
});

const MyWorkItemsResult = Schema.Struct({
  organization: Organization,
  items: Schema.Array(AzureWorkItemSummarySchema).annotate({
    description: "Newest first. Each entry is one work item, unterminated.",
  }),
});

const WorkItemResult = Schema.Struct({
  organization: Organization,
  item: AzureWorkItemSummarySchema,
  description: Schema.NullOr(Schema.String).annotate({
    description:
      "The work item's description as plain text, clipped to 1200 characters. Null when it is empty.",
  }),
});

const LinkResult = Schema.Struct({
  threadId: ThreadId.annotate({ description: "The thread the link now belongs to." }),
  link: Schema.NullOr(AzureDevOpsWorkItemLink).annotate({
    description: "Null after unlinking.",
  }),
  item: Schema.NullOr(AzureWorkItemSummarySchema),
});

const UPCODE = "UPCode (this desktop app)";

export const AzureMyWorkItemsTool = Tool.make("azure_devops_my_work_items", {
  description: `Which Azure DevOps work items are assigned to the person whose PAT this ${UPCODE} server holds, newest first.

Use it when the user refers to their work by name instead of by id — "my current task", "the ticket I'm on", "what am I doing today" — or when you need an id to pass to azure_devops_link_thread. It reads Azure DevOps through the PAT configured in Settings → Source control; it changes nothing.

Returns up to 25 items (id, project, title, type, state, sprint, area, assignee, url, last change). Only open items by default: states named Closed, Done, Removed, Completed or Cancelled are filtered out on the server, so a task that was closed but is still assigned does not appear.

Two rules that matter:
- Never choose between several active items on the user's behalf. If more than one could be the task they mean, list the candidates with their ids and ask which one.
- An empty list means no open items are assigned to them, not that the connection failed. A failed connection returns an error instead.`,
  parameters: Schema.Struct({
    activeOnly: Schema.optional(
      Schema.Boolean.annotate({
        description:
          "Default true. Set false to include Closed/Done/Removed/Completed/Cancelled items, which is only useful to find something that was already finished.",
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
  .annotate(Tool.Title, "UPCode · my Azure DevOps work items")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const AzureWorkItemTool = Tool.make("azure_devops_work_item", {
  description: `Read one Azure DevOps work item in full: title, type, state, sprint, area, assignee, url and a plain-text excerpt of its description.

Use it after azure_devops_my_work_items, or whenever the user names an id, to learn what a task actually asks for before you start working on it or link it. Read-only: it changes nothing in Azure DevOps.

The project is looked up from the caller's own assignments when you omit it; pass it explicitly for a work item assigned to someone else.`,
  parameters: WorkItemTarget,
  success: WorkItemResult,
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies,
})
  .annotate(Tool.Title, "UPCode · read an Azure DevOps work item")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const AzureLinkThreadTool = Tool.make("azure_devops_link_thread", {
  description: `Link this conversation to an Azure DevOps work item. This is what makes ${UPCODE} show the task in the thread header and on the thread card, and what the user means by "enlaza la tarea a este hilo".

Omit threadId for the current thread. The project is resolved from the caller's own assignments; pass it when the item is not assigned to them.

What it changes: only UPCode's own link (stored in the app's settings). Nothing is written to Azure DevOps — no state change, no comment, no field. Linking an already-linked thread replaces the previous link, and calling it twice with the same id is harmless.

Before calling it, be sure the id is the task the user means. If it is ambiguous, ask first; after linking, say which task you linked so they can correct it.`,
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
  .annotate(Tool.Title, "UPCode · link this thread to a work item")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const AzureUnlinkThreadTool = Tool.make("azure_devops_unlink_thread", {
  description: `Remove the Azure DevOps work item linked to a thread, leaving ${UPCODE} and Azure DevOps otherwise untouched. Use it when the user says the thread points at the wrong task or asks to remove the link.

Omit threadId for the current thread. Returns the thread id with a null link.`,
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
  .annotate(Tool.Title, "UPCode · unlink the thread's work item")
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
