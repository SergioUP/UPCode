import type { PullRequestListEntry } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { pullRequestEnvironment } from "../../state/pullRequests";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";

/** One colour per state, so a column of cards can be read without reading the pills. */
const STATE_COLOR: Record<PullRequestListEntry["state"], string> = {
  open: "#4c9aff",
  merged: "#22c55e",
  closed: "#ef4444",
};

const STATE_LABEL: Record<PullRequestListEntry["state"], string> = {
  open: "Abierta",
  merged: "Completada",
  closed: "Abandonada",
};

const CHECK_COLOR: Record<NonNullable<PullRequestListEntry["checksState"]>, string> = {
  passing: "#22c55e",
  failing: "#ef4444",
  pending: "#f59e0b",
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const when = (value: string): string => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  const hours = (Date.now() - time) / 3_600_000;
  if (hours < 1) return "hace minutos";
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} d`;
};

/** `repo` in a listing is `owner/name`; the name is what identifies it day to day. */
const shortRepository = (repository: string): string => repository.split("/").at(-1) ?? repository;

function PullRequestCard({ entry }: { readonly entry: PullRequestListEntry }) {
  const color = STATE_COLOR[entry.state];
  const checks = entry.checksState ? CHECK_COLOR[entry.checksState] : null;
  return (
    <li>
      <Link
        to="/pull-requests"
        search={{
          projectId: entry.projectId,
          host: entry.host,
          repository: entry.repository,
          number: entry.number,
          selectedProjectId: entry.projectId,
          selectedHost: entry.host,
          involvement: "all",
          state: "all",
        }}
        className="flex h-full flex-col gap-2 rounded-lg border border-border/70 px-3 py-2.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="shrink-0 rounded px-1.5 py-px text-3xs font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${color}26`, color }}
          >
            {entry.isDraft ? "Borrador" : STATE_LABEL[entry.state]}
          </span>
          <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
            {shortRepository(entry.repository)}
          </span>
          <span
            className="shrink-0 rounded px-1 py-px font-mono text-3xs font-semibold"
            style={{ backgroundColor: color, color: "#0b0b0b" }}
          >
            #{entry.number}
          </span>
          {entry.viewerReviewRequested ? (
            <span className="shrink-0 rounded bg-warning/15 px-1.5 py-px text-3xs font-medium text-warning">
              te toca revisar
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-3xs text-muted-foreground">
            {when(entry.updatedAt)}
          </span>
        </div>

        <p className="line-clamp-2 text-sm font-medium leading-snug">{entry.title}</p>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-3xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1 font-mono">
            <span className="max-w-[12rem] truncate">{entry.headBranch}</span>
            <span aria-hidden>→</span>
            <span className="max-w-[10rem] truncate">{entry.baseBranch}</span>
          </span>
          <span aria-hidden>·</span>
          <span className="truncate">{entry.projectTitle}</span>
        </div>

        <div className="mt-auto flex items-center gap-3 text-3xs text-muted-foreground">
          {entry.author ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary">
                {initials(entry.author.name ?? entry.author.login ?? "")}
              </span>
              <span className="max-w-[10rem] truncate">
                {entry.author.name ?? entry.author.login ?? "sin nombre"}
              </span>
            </span>
          ) : (
            <span>sin autor</span>
          )}
          {entry.additions > 0 || entry.deletions > 0 ? (
            <span className="font-mono tabular-nums">
              <span className="text-success">+{entry.additions}</span>{" "}
              <span className="text-destructive">−{entry.deletions}</span>
            </span>
          ) : null}
          {checks ? (
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: checks }} />
              {entry.checksState === "passing"
                ? "checks en verde"
                : entry.checksState === "failing"
                  ? "checks en rojo"
                  : "checks pendientes"}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/**
 * The first cut of the PR Center: one card per pull request, across every project of the
 * workspace, with the things you need to decide whether to open it — repository, branches,
 * author, checks and how stale it is. The full workspace still lives behind a click.
 */
export function PullRequestDashboard() {
  const navigateToMainApp = useNavigateToMainApp();
  const environmentId = usePrimaryEnvironmentId();
  const [state, setState] = useState<"open" | "all">("open");
  const [involvement, setInvolvement] = useState<"all" | "authored" | "reviewing">("all");
  const [search, setSearch] = useState("");
  const list = useEnvironmentQuery(
    environmentId
      ? pullRequestEnvironment.list({ environmentId, input: { state, involvement } })
      : null,
  );
  const entries = list.data?.entries ?? [];
  const providers = list.data?.providers ?? [];
  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      term
        ? entries.filter((entry) =>
            [entry.title, entry.repository, entry.headBranch, entry.baseBranch, entry.author?.name]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(term)),
          )
        : entries,
    [entries, term],
  );

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <button
          type="button"
          onClick={navigateToMainApp}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Volver
        </button>
        <h1 className="text-base font-semibold">PR Center</h1>
        <span className="text-xs text-muted-foreground">
          {visible.length} pull requests · {providers.length} repositorios
        </span>
      </WorkspacePageHeader>

      <div className="flex h-[calc(100vh-var(--workspace-topbar-height))] min-h-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["open", "Abiertas"],
              ["all", "Todas"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={state === key}
              onClick={() => setState(key)}
              className={`rounded-full border px-2.5 py-1 text-2xs transition-colors ${
                state === key
                  ? "border-ring bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          {(
            [
              ["all", "Todas"],
              ["authored", "Creadas por mí"],
              ["reviewing", "Para revisar"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={involvement === key}
              onClick={() => setInvolvement(key)}
              className={`rounded-full border px-2.5 py-1 text-2xs transition-colors ${
                involvement === key
                  ? "border-ring bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <label className="relative ml-auto w-64">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, repo o rama"
              aria-label="Buscar pull request"
              className="w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            />
          </label>
          <button
            type="button"
            onClick={() => list.refresh()}
            className="rounded-md border px-2.5 py-1.5 text-2xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            Actualizar
          </button>
        </div>

        {list.error ? (
          <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-2xs text-destructive">
            {list.error}
          </p>
        ) : null}
        {providers.some((provider) => !provider.configured) ? (
          <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs text-warning">
            {providers
              .filter((provider) => !provider.configured)
              .map((provider) => `${provider.host}: ${provider.detail ?? "sin configurar"}`)
              .join(" · ")}
          </p>
        ) : null}

        {list.isPending && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Leyendo pull requests…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <PullRequestGlyph.pullRequest className="size-4" />
              No hay pull requests que enseñar con estos filtros.
            </p>
            {entries.length === 0 && providers.length === 0 ? (
              <p className="mt-2 text-xs">
                Si no hay ningún repositorio configurado, añade el proyecto en Ajustes → Projects y
                las credenciales del host en Ajustes → Source control.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto xl:grid-cols-2">
            {visible.map((entry) => (
              <PullRequestCard
                key={`${entry.host}|${entry.repository}|${entry.number}`}
                entry={entry}
              />
            ))}
          </ul>
        )}
      </div>
    </SidebarInset>
  );
}
