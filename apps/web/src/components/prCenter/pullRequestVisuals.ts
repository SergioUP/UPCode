import type { PullRequestListEntry } from "@t3tools/contracts";

/** One colour per state, so a column of cards can be read without reading the pills. */
export const PR_STATE_COLOR: Record<PullRequestListEntry["state"], string> = {
  open: "#4c9aff",
  merged: "#22c55e",
  closed: "#ef4444",
};

export const PR_STATE_LABEL: Record<PullRequestListEntry["state"], string> = {
  open: "Abierta",
  merged: "Completada",
  closed: "Abandonada",
};

export const PR_CHECK_COLOR: Record<NonNullable<PullRequestListEntry["checksState"]>, string> = {
  passing: "#22c55e",
  failing: "#ef4444",
  pending: "#f59e0b",
};

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Relative age for a row or a header: "hace 2 h", "ayer", "hace 5 d". */
export const relativeAge = (value: string | null | undefined): string => {
  if (!value) return "—";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  const hours = (Date.now() - time) / 3_600_000;
  if (hours < 1) return "hace minutos";
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} d`;
};

/** `repo` in a listing is `owner/name`; the name is what identifies it day to day. */
export const shortRepository = (repository: string): string =>
  repository.split("/").at(-1) ?? repository;
