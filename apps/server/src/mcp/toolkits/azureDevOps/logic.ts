/**
 * Pure helpers for the Azure DevOps toolkit.
 *
 * Kept apart from the handlers so the parts that decide what the agent sees
 * (which items count as "mine and open", how much description is worth sending,
 * which project an id belongs to) can be tested without a PAT or the network.
 *
 * @module mcp/toolkits/azureDevOps/logic
 */

import type { AzureDevOpsWorkItem } from "@upcode/contracts";
import * as Schema from "effect/Schema";

/** States that mean the work is over, across the processes this company uses. */
const CLOSED_STATES = new Set(["closed", "done", "removed", "completed", "cancelled"]);

export function isActiveState(state: string): boolean {
  return !CLOSED_STATES.has(state.trim().toLowerCase());
}

/**
 * The description arrives as HTML from Azure. The agent only needs the words,
 * and a board card's HTML would waste the whole context window.
 */
export function plainText(html: string | null, maximum = 1200): string | null {
  if (html === null) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0) return null;
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

/** What a tool call returns per item: enough to identify it, not the whole card. */
export const AzureWorkItemSummarySchema = Schema.Struct({
  id: Schema.Int,
  project: Schema.String,
  title: Schema.String,
  type: Schema.String,
  state: Schema.String,
  assignedTo: Schema.NullOr(Schema.String),
  iteration: Schema.NullOr(Schema.String),
  area: Schema.NullOr(Schema.String),
  url: Schema.String,
  changedAt: Schema.NullOr(Schema.String),
});
export type AzureWorkItemSummary = typeof AzureWorkItemSummarySchema.Type;

export function summarizeWorkItem(item: AzureDevOpsWorkItem): AzureWorkItemSummary {
  return {
    id: item.id,
    project: item.project,
    title: item.title,
    type: item.type,
    state: item.state,
    assignedTo: item.assignedTo,
    iteration: item.iteration,
    area: item.area ?? null,
    url: item.url,
    changedAt: item.changedAt,
  };
}

/**
 * The project an id belongs to, as far as the caller's own assignments know it.
 * `null` means "ask for the project": guessing across the organisation would
 * bind the thread to a work item the user never mentioned.
 */
export function findProjectForWorkItem(
  items: ReadonlyArray<AzureDevOpsWorkItem>,
  workItemId: number,
): string | null {
  return items.find((item) => item.id === workItemId)?.project ?? null;
}
