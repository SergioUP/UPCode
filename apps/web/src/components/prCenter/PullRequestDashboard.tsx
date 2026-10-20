import type { PullRequestListEntry } from "@t3tools/contracts";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { azureDevOps } from "../../state/azureDevOps";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "../ui/combobox";
import { ArrowLeftIcon } from "lucide-react";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { pullRequestEnvironment } from "../../state/pullRequests";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { PullRequestWorkspace } from "./PullRequestWorkspace";
import {
  initials,
  PR_CHECK_COLOR,
  PR_STATE_COLOR,
  PR_STATE_LABEL,
  relativeAge,
  shortRepository,
} from "./pullRequestVisuals";

type SelectOption = { readonly id: string; readonly label: string };

/** A filter that carries its own search box: Azure has dozens of projects and repositories. */
function SearchSelect({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly options: ReadonlyArray<SelectOption>;
  readonly onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value) ?? null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? options.filter((option) => option.label.toLowerCase().includes(needle))
      : options;
  }, [options, query]);
  return (
    <Combobox
      items={options}
      filteredItems={filtered}
      autoHighlight
      itemToStringLabel={(option: SelectOption) => option.label}
      isItemEqualToValue={(left: SelectOption, right: SelectOption) => left.id === right.id}
      value={selected}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      onValueChange={(option: SelectOption | null) => onChange(option?.id ?? "")}
    >
      <ComboboxTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex max-w-[17rem] items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="max-w-[11rem] truncate">{selected?.label ?? placeholder}</span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </ComboboxTrigger>
      <ComboboxPopup align="start" className="w-64">
        <ComboboxSearchInput
          aria-label={`Buscar ${label.toLowerCase()}`}
          placeholder="Buscar…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
        <ComboboxList>
          {(option: SelectOption) => (
            <ComboboxItem key={option.id} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

/** `owner/name` or a bare name both identify a repository inside a project. */
const belongsToRepository = (entry: PullRequestListEntry, name: string): boolean =>
  entry.repository === name || entry.repository.endsWith(`/${name}`);

function PullRequestCard({
  entry,
  onSelect,
}: {
  readonly entry: PullRequestListEntry;
  readonly onSelect: (entry: PullRequestListEntry) => void;
}) {
  const color = PR_STATE_COLOR[entry.state];
  const checks = entry.checksState ? PR_CHECK_COLOR[entry.checksState] : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="flex h-full w-full flex-col gap-2 rounded-lg border border-border/70 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ borderLeft: `3px solid ${color}` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="shrink-0 rounded px-1.5 py-px text-3xs font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${color}26`, color }}
          >
            {entry.isDraft ? "Borrador" : PR_STATE_LABEL[entry.state]}
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
            {relativeAge(entry.updatedAt)}
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
      </button>
    </li>
  );
}

/**
 * The PR Center: one card per pull request, across every project of the workspace, with the
 * things needed to decide whether to open it — repository, branches, author, checks and how
 * stale it is. Opening a card leads to this module's own workspace, not to T3's panel.
 */
export function PullRequestDashboard() {
  const navigateToMainApp = useNavigateToMainApp();
  const environmentId = usePrimaryEnvironmentId();
  const [state, setState] = useState<"open" | "all">("open");
  const [involvement, setInvolvement] = useState<"all" | "authored" | "reviewing">("all");
  const [host, setHost] = useState("");
  const [projectName, setProjectName] = useState("");
  const [repository, setRepository] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PullRequestListEntry | null>(null);
  const list = useEnvironmentQuery(
    environmentId
      ? pullRequestEnvironment.list({ environmentId, input: { state, involvement } })
      : null,
  );
  const entries = list.data?.entries ?? [];
  const providers = list.data?.providers ?? [];
  /**
   * A host without credentials is expected — this workspace holds a GitHub checkout and no GitHub
   * login — so it is a quiet note, and it steps aside when the filter already says which host the
   * reader cares about.
   */
  const unconfiguredProviders = providers.filter(
    (provider) => !provider.configured && (!host || provider.host === host),
  );
  // The listing refreshes on focus and every couple of minutes while the tab is visible, the
  // same liveness the rest of the pull-request surfaces have.
  useLiveRefresh(() => list.refresh(), { key: "pr-center", intervalMs: 120_000 });

  const hosts = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.host))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [entries],
  );
  /**
   * The projects in this filter are Azure DevOps' own projects, not the local checkouts: the
   * question a reviewer asks is "what is waiting in Shopify", and a project with no checkout yet
   * simply answers with an empty list instead of hiding.
   */
  const adoProjects = useEnvironmentQuery(
    environmentId ? azureDevOps.projects({ environmentId, input: {} }) : null,
  );
  const adoRepositories = useEnvironmentQuery(
    environmentId && projectName
      ? azureDevOps.repositories({ environmentId, input: { project: projectName } })
      : null,
  );
  const projectOptions = useMemo<ReadonlyArray<{ id: string; label: string }>>(() => {
    const names = (adoProjects.data ?? []).map((project) => project.name).filter(Boolean);
    if (names.length > 0) {
      return [...new Set(names)]
        .sort((left, right) => left.localeCompare(right, "es"))
        .map((name) => ({ id: name, label: name }));
    }
    // Azure not reachable: fall back to the projects the listing itself knows about.
    return [...new Map(entries.map((entry) => [entry.projectTitle, entry.projectTitle])).keys()]
      .sort((left, right) => left.localeCompare(right, "es"))
      .map((name) => ({ id: name, label: name }));
  }, [adoProjects.data, entries]);
  const repositoryOptions = useMemo<ReadonlyArray<{ id: string; label: string }>>(() => {
    const fromHost = (adoRepositories.data ?? []).map((repository) => repository.name);
    const names =
      fromHost.length > 0
        ? fromHost
        : entries
            .filter((entry) => !host || entry.host === host)
            .map((entry) => shortRepository(entry.repository));
    const unique = [...new Set(names)].sort((left, right) => left.localeCompare(right, "es"));
    return unique.map((name) => ({ id: name, label: name }));
  }, [adoRepositories.data, entries, host]);
  /** A cached project's repositories: the row belongs to the project when it is one of its repos. */
  const projectRepositories = useMemo(
    () => new Set((adoRepositories.data ?? []).map((repository) => repository.name)),
    [adoRepositories.data],
  );

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      entries.filter((entry) => {
        if (host && entry.host !== host) return false;
        if (projectName && projectRepositories.size > 0) {
          const names = [...projectRepositories];
          if (!names.some((name) => belongsToRepository(entry, name))) return false;
        }
        if (repository && !belongsToRepository(entry, repository)) return false;
        if (!term) return true;
        return [
          entry.title,
          entry.repository,
          entry.headBranch,
          entry.baseBranch,
          entry.author?.name,
        ]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLowerCase().includes(term));
      }),
    [entries, host, projectName, projectRepositories, repository, term],
  );

  if (selected && environmentId) {
    return (
      <PullRequestWorkspace
        entry={selected}
        environmentId={environmentId}
        onBack={() => setSelected(null)}
      />
    );
  }

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

        <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          <SearchSelect
            label="Organización"
            placeholder="Todas"
            value={host}
            options={hosts.map((value) => ({ id: value, label: value }))}
            onChange={(value) => {
              setHost(value);
              setProjectName("");
              setRepository("");
            }}
          />
          <SearchSelect
            label="Proyecto"
            placeholder="Todos"
            value={projectName}
            options={projectOptions}
            onChange={(value) => {
              setProjectName(value);
              setRepository("");
            }}
          />
          <SearchSelect
            label="Repositorio"
            placeholder="Todos"
            value={repository}
            options={repositoryOptions}
            onChange={setRepository}
          />
          {host || projectName || repository ? (
            <button
              type="button"
              onClick={() => {
                setHost("");
                setProjectName("");
                setRepository("");
              }}
              className="rounded-md border border-dashed px-2 py-1 text-2xs hover:bg-accent/50 hover:text-foreground"
            >
              Quitar filtros
            </button>
          ) : null}
        </div>

        {list.error ? (
          <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-2xs text-destructive">
            {list.error}
          </p>
        ) : null}
        {unconfiguredProviders.length > 0 ? (
          <p className="text-2xs text-muted-foreground">
            {unconfiguredProviders
              .map(
                (provider) =>
                  `${provider.host} (${provider.projectCount} ${
                    provider.projectCount === 1 ? "proyecto" : "proyectos"
                  })`,
              )
              .join(" · ")}{" "}
            sin credenciales, así que sus PRs no se listan. Se configuran en Ajustes → Source
            control; Azure DevOps funciona con la CLI.
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
                onSelect={setSelected}
              />
            ))}
          </ul>
        )}
      </div>
    </SidebarInset>
  );
}
