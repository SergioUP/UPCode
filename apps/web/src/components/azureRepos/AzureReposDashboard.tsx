import type { AzureDevOpsPullRequest, AzureDevOpsRepository } from "@t3tools/contracts";
import {
  ActivityIcon,
  CheckCircle2Icon,
  CircleIcon,
  Clock3Icon,
  Code2Icon,
  DatabaseIcon,
  FolderIcon,
  GitBranchIcon,
  LayersIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { PullRequestStateGlyph } from "../pullRequest/pullRequestPresentation";
import {
  filterPullRequests,
  latestCreation,
  relativeDate,
  reviewState,
  type PullRequestScope,
} from "./azureReposModel";

type Repository = typeof AzureDevOpsRepository.Type;
const VIEWS = [
  { id: "summary", label: "Resumen", icon: LayersIcon },
  { id: "prs", label: "Pull Requests", icon: PullRequestGlyph.pullRequest },
  { id: "repos", label: "Repositorios", icon: DatabaseIcon },
  { id: "activity", label: "Actividad", icon: ActivityIcon },
] as const;
export type AzureReposView = (typeof VIEWS)[number]["id"];

export function AzurePicker({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  icon?: ReactNode;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      items={options}
    >
      <SelectTrigger size="sm" className="w-auto" aria-label={label}>
        {icon}
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function Panel({
  title,
  icon,
  extra,
  children,
  selected = false,
}: {
  title: ReactNode;
  icon: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  selected?: boolean;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border bg-card/80 shadow-sm",
        selected && "border-primary/40",
      )}
    >
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="flex items-center gap-3 text-sm font-semibold lg:text-base">
          {icon}
          {title}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function ReviewBadge({ pr }: { pr: AzureDevOpsPullRequest }) {
  const state = reviewState(pr);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-2xs font-medium",
        state.tone === "success"
          ? "bg-success/15 text-success-foreground"
          : state.tone === "warning"
            ? "bg-warning/15 text-warning-foreground"
            : state.tone === "info"
              ? "bg-info/15 text-info-foreground"
              : "bg-muted text-muted-foreground",
      )}
    >
      {state.tone === "success" ? (
        <CheckCircle2Icon className="size-3" />
      ) : (
        <CircleIcon className="size-3" />
      )}
      {state.label}
    </span>
  );
}

export function AzureReposDashboard({
  repositories,
  pullRequests,
  repositoryId,
  onRepositoryChange,
  onOpenPullRequest,
  loading,
  view,
  onViewChange,
  now,
}: {
  repositories: readonly Repository[];
  pullRequests: readonly AzureDevOpsPullRequest[];
  repositoryId: string;
  onRepositoryChange: (id: string) => void;
  onOpenPullRequest: (pr: AzureDevOpsPullRequest) => void;
  loading: boolean;
  view: AzureReposView;
  onViewChange: (view: AzureReposView) => void;
  now: number;
}) {
  const [inspectedId, setInspectedId] = useState("");
  const [scope, setScope] = useState<PullRequestScope>("mine");
  const inspected =
    repositories.find((repo) => repo.id === (repositoryId || inspectedId)) ?? repositories[0];
  const visiblePrs = filterPullRequests(pullRequests, repositoryId, scope);
  const ordered = visiblePrs.toSorted(
    (a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0),
  );
  const pending = visiblePrs.filter(
    (pr) => !pr.isDraft && reviewState(pr).tone !== "success",
  ).length;
  const inspectedPrs = pullRequests.filter((pr) => pr.repositoryId === inspected?.id);
  const lastCreated = latestCreation(visiblePrs);
  const pickRepo = (id: string) => {
    setInspectedId(id);
    onRepositoryChange(id === repositoryId ? "" : id);
  };
  const stats = [
    { icon: DatabaseIcon, value: repositories.length, label: "Repositorios del proyecto" },
    { icon: PullRequestGlyph.pullRequest, value: visiblePrs.length, label: "PRs abiertas" },
    { icon: Code2Icon, value: pending, label: "Revisiones pendientes" },
    { icon: ActivityIcon, value: relativeDate(lastCreated, now), label: "Última PR creada" },
  ];
  const repoPicker = (
    <AzurePicker
      label="Filtro de repositorio"
      value={repositoryId}
      onChange={onRepositoryChange}
      options={[
        { value: "", label: "Todos" },
        ...repositories.map((repo) => ({ value: repo.id, label: repo.name })),
      ]}
    />
  );
  const repoList = (
    <Panel
      title={
        <>
          Repositorios del proyecto{" "}
          <span className="font-normal text-muted-foreground">({repositories.length})</span>
        </>
      }
      icon={<FolderIcon className="size-6 text-primary" />}
    >
      <div className="px-3 pb-3">
        <div className="grid grid-cols-[1fr_5rem_6rem] gap-2 px-2 py-3 text-2xs text-muted-foreground">
          <span>Repositorio</span>
          <span className="text-center">PRs abiertas</span>
          <span className="text-right">Última PR</span>
        </div>
        {repositories.map((repo) => {
          const prs = pullRequests.filter((pr) => pr.repositoryId === repo.id);
          return (
            <button
              type="button"
              key={repo.id}
              aria-pressed={inspected?.id === repo.id}
              onClick={() => pickRepo(repo.id)}
              className={cn(
                "grid w-full grid-cols-[1fr_5rem_6rem] items-center gap-2 rounded-lg border-l-2 border-transparent px-2 py-2.5 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                inspected?.id === repo.id && "border-primary bg-primary/10",
              )}
            >
              <span className="flex min-w-0 items-center gap-3 font-medium">
                <Code2Icon className="size-4 shrink-0" />
                <span className="truncate">{repo.name}</span>
              </span>
              <span className="mx-auto min-w-8 rounded-md bg-muted px-2 py-0.5 text-center font-semibold tabular-nums">
                {prs.length}
              </span>
              <span className="text-right text-muted-foreground">
                {relativeDate(latestCreation(prs), now)}
              </span>
            </button>
          );
        })}
        {!repositories.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {loading ? "Cargando repositorios…" : "Este proyecto no tiene repositorios visibles."}
          </p>
        )}
      </div>
    </Panel>
  );
  const repoDetail = (
    <Panel title="Detalle del repositorio" icon={<DatabaseIcon className="size-6" />} selected>
      {inspected ? (
        <div className="space-y-4 p-4">
          <h3 className="flex items-center gap-3 text-base font-semibold">
            <LayersIcon className="size-5 text-primary" />
            {inspected.name}
            <span className="text-xs font-normal text-muted-foreground">(Seleccionado)</span>
          </h3>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-muted/20">
            {[
              {
                icon: PullRequestGlyph.pullRequest,
                title: "PRs abiertas",
                value: inspectedPrs.length,
              },
              {
                icon: GitBranchIcon,
                title: "Rama principal",
                value: inspected.defaultBranch?.replace(/^refs\/heads\//, "") ?? "Sin configurar",
              },
              {
                icon: Code2Icon,
                title: "Revisiones pendientes",
                value: inspectedPrs.filter(
                  (pr) => !pr.isDraft && reviewState(pr).tone !== "success",
                ).length,
              },
              {
                icon: Clock3Icon,
                title: "Última PR creada",
                value: relativeDate(latestCreation(inspectedPrs), now),
              },
            ].map(({ icon: Icon, title, value }) => (
              <div
                key={title}
                className="flex min-w-0 gap-3 p-3 [&:nth-child(odd)]:border-r [&:nth-child(-n+2)]:border-b"
              >
                <Icon className="mt-1 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-2xs text-muted-foreground">{title}</p>
                  <p
                    className="truncate text-sm font-semibold tabular-nums"
                    aria-label={String(value)}
                  >
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-xs">
            <span>Estado del repositorio</span>
            <span className="rounded-md bg-success/15 px-3 py-1 text-success-foreground">
              Accesible
            </span>
          </div>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          Selecciona un repositorio para ver su detalle.
        </p>
      )}
    </Panel>
  );
  return (
    <>
      <nav
        aria-label="Secciones de Azure Repos"
        className="flex shrink-0 gap-2 overflow-x-auto border-b px-3 lg:gap-5"
      >
        {VIEWS.map(({ id, icon: Icon, label }) => (
          <button
            type="button"
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onViewChange(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              view === id ? "border-primary text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      <main
        className="@container min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both p-3 lg:p-5"
        aria-busy={loading}
      >
        <div className="mx-auto max-w-[1600px] space-y-4">
          <div className="grid grid-cols-2 gap-3 @min-[760px]:grid-cols-4">
            {stats.map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className="flex min-h-24 items-center gap-4 rounded-xl border bg-card/80 px-4 py-4 shadow-sm lg:px-5"
              >
                <Icon className="size-7 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate font-semibold tabular-nums",
                      typeof value === "number" ? "text-2xl" : "text-base",
                    )}
                  >
                    {loading ? "—" : value}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
            ))}
          </div>
          {(view === "summary" || view === "prs") && (
            <div
              className={cn(
                "grid items-start gap-4",
                view === "summary" && "@min-[880px]:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]",
              )}
            >
              <Panel
                title="Pull Requests del proyecto"
                icon={<PullRequestGlyph.pullRequest className="size-6" />}
                extra={
                  <div className="flex flex-wrap gap-2">
                    <AzurePicker
                      label="PR"
                      value={scope}
                      onChange={(value) => setScope(value === "all" ? "all" : "mine")}
                      options={[
                        { value: "mine", label: "Creadas por mí o asignadas a mí" },
                        { value: "all", label: "Todas" },
                      ]}
                    />
                    {repoPicker}
                  </div>
                }
              >
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b text-2xs font-normal text-muted-foreground">
                        {["#", "Título", "Repositorio", "Estado", "Revisor / Autor", "Creada"].map(
                          (heading) => (
                            <th key={heading} scope="col" className="px-2 py-3 font-medium">
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {ordered.map((pr) => (
                        <tr
                          key={pr.id}
                          className="group border-b border-border/60 last:border-0 hover:bg-accent/60"
                        >
                          <td className="px-2 py-3 text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <PullRequestStateGlyph state="open" isDraft={pr.isDraft} />#{pr.id}
                            </span>
                          </td>
                          <td className="max-w-64 px-2 py-2">
                            <button
                              type="button"
                              onClick={() => onOpenPullRequest(pr)}
                              className="block w-full rounded-sm text-left font-medium leading-relaxed outline-none group-hover:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                              {pr.title}
                            </button>
                          </td>
                          <td
                            className="max-w-32 truncate px-2 py-2 text-muted-foreground"
                            aria-label={pr.repositoryName}
                          >
                            {pr.repositoryName ??
                              repositories.find((repo) => repo.id === pr.repositoryId)?.name ??
                              "—"}
                          </td>
                          <td className="px-2 py-2">
                            <ReviewBadge pr={pr} />
                          </td>
                          <td
                            className="max-w-32 truncate px-2 py-2"
                            aria-label={
                              (pr.reviewers ?? []).map((reviewer) => reviewer.name).join(", ") ||
                              pr.createdBy
                            }
                          >
                            {pr.reviewers?.[0]?.name || pr.createdBy}
                          </td>
                          <td
                            className="whitespace-nowrap px-2 py-2 text-muted-foreground"
                            aria-label={pr.createdAt ?? undefined}
                          >
                            {relativeDate(pr.createdAt, now)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!ordered.length && (
                    <p role="status" className="py-12 text-center text-sm text-muted-foreground">
                      {loading
                        ? "Cargando pull requests…"
                        : scope === "mine" && pullRequests.some((pr) => pr.involvesViewer == null)
                          ? "No se pudo identificar el usuario conectado. Selecciona Todas para ver las PR."
                          : "No hay pull requests abiertas para esta selección."}
                    </p>
                  )}
                </div>
              </Panel>
              {view === "summary" && (
                <aside className="space-y-4">
                  {repoList}
                  {repoDetail}
                </aside>
              )}
            </div>
          )}
          {view === "repos" && (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {repoList}
              {repoDetail}
            </div>
          )}
          {view === "activity" && (
            <Panel
              title="Actividad de pull requests"
              icon={<ActivityIcon className="size-6 text-primary" />}
              extra={repoPicker}
            >
              <p className="px-4 pt-3 text-xs text-muted-foreground">
                Creación de las PR abiertas del proyecto.
              </p>
              <ol className="divide-y divide-border/60 px-4">
                {ordered.map((pr) => (
                  <li key={pr.id} className="flex items-start gap-3 py-4">
                    <PullRequestGlyph.pullRequest className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenPullRequest(pr)}
                        className="rounded-sm text-left text-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        #{pr.id} · {pr.title}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {pr.createdBy} creó una PR en {pr.repositoryName}
                      </p>
                    </div>
                    <time
                      dateTime={pr.createdAt ?? undefined}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {relativeDate(pr.createdAt, now)}
                    </time>
                  </li>
                ))}
              </ol>
              {!ordered.length && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  {loading ? "Cargando actividad…" : "No hay actividad de PR abiertas."}
                </p>
              )}
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}
