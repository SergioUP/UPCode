import type { AzureDevOpsPullRequest } from "@t3tools/contracts";

export type PullRequestScope = "mine" | "all";

export function filterPullRequests(
  prs: readonly AzureDevOpsPullRequest[],
  repositoryId: string,
  scope: PullRequestScope,
) {
  return prs.filter(
    (pr) =>
      (!repositoryId || pr.repositoryId === repositoryId) &&
      (scope === "all" || pr.involvesViewer === true),
  );
}

export function reviewState(pr: AzureDevOpsPullRequest) {
  if (pr.isDraft) return { label: "Borrador", tone: "muted" } as const;
  const reviewers = pr.reviewers ?? [];
  if (reviewers.some((reviewer) => reviewer.vote < 0)) {
    return { label: "Cambios solicitados", tone: "warning" } as const;
  }
  const required = reviewers.filter((reviewer) => reviewer.required);
  if (
    reviewers.some((reviewer) => reviewer.vote > 0) &&
    required.every((reviewer) => reviewer.vote > 0)
  ) {
    return { label: "Aprobada", tone: "success" } as const;
  }
  if (reviewers.length) return { label: "En revisión", tone: "warning" } as const;
  return { label: "Activa", tone: "info" } as const;
}

export function relativeDate(value: string | null | undefined, now = Date.now()) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  if (minutes < 2880) return "ayer";
  return `hace ${Math.floor(minutes / 1440)} días`;
}

export function latestCreation(prs: readonly AzureDevOpsPullRequest[]) {
  return prs.reduce<string | null>((latest, pr) => {
    const date = pr.createdAt;
    return date &&
      Number.isFinite(Date.parse(date)) &&
      (!latest || Date.parse(date) > Date.parse(latest))
      ? date
      : latest;
  }, null);
}
