/**
 * Pure helpers for the subagent tools.
 *
 * Kept apart so the two decisions that matter — which role the model meant, and
 * what the delegated child is told — can be tested without a server, a provider
 * or a thread.
 *
 * @module mcp/toolkits/orchestrator/subagentLogic
 */

import type { Subagent } from "@t3tools/contracts";

/** Resolves by exact id first, then by name, case-insensitively. */
export function findSubagent(
  subagents: ReadonlyArray<Subagent>,
  reference: string,
): Subagent | undefined {
  const needle = reference.trim().toLowerCase();
  return (
    subagents.find((subagent) => subagent.id === reference) ??
    subagents.find((subagent) => subagent.name.toLowerCase() === needle)
  );
}

/**
 * The brief a delegated child receives: the role first, then the tools the user
 * pinned, then the task. A child agent never sees this conversation, so the role
 * has to travel with the work or the delegation is just a prompt.
 */
export function composeSubagentTask(subagent: Subagent, task: string): string {
  const role =
    subagent.prompt.trim().length > 0
      ? subagent.prompt.trim()
      : "No further instructions were written for this role.";
  const tools =
    subagent.tools !== undefined && subagent.tools.length > 0
      ? `\nTools this role should use: ${subagent.tools.join(", ")}.`
      : "";

  return [
    `You are "${subagent.name}", a subagent defined by the user in UPCode.`,
    "",
    role,
    tools,
    "",
    "Task:",
    task.trim(),
  ]
    .join("\n")
    .trim();
}
