import type { PullRequestThreadStatus } from "@upcode/contracts";

const LABELS: Record<PullRequestThreadStatus, string> = {
  active: "Active",
  pending: "Pending",
  fixed: "Resolved",
  wontFix: "Won't fix",
  closed: "Closed",
  byDesign: "By design",
  unknown: "Unknown",
};

export const pullRequestThreadStatusLabel = (status: PullRequestThreadStatus): string =>
  LABELS[status];

/**
 * The state a thread is in for display: the host's own where it has one, otherwise the two the
 * resolve toggle moves between.
 */
export function pullRequestThreadDisplayStatus(thread: {
  readonly status?: PullRequestThreadStatus | undefined;
  readonly isResolved: boolean;
}): PullRequestThreadStatus {
  return thread.status ?? (thread.isResolved ? "fixed" : "active");
}
