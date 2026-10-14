import type { AzureDevOpsPullRequest, ProjectId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  ServerIcon,
  SettingsIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { azureDevOps } from "../../state/azureDevOps";
import { useProjects, useThreadShells } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { WorkItemDetail } from "../chat/WorkItemDetail";
import { PullRequestDetailPanel } from "../pullRequest/PullRequestDetailPanel";
import { isElectron } from "../../env";

type StateCategory = "new" | "active" | "blocked" | "review" | "done" | "removed";

const STATE_CATEGORY: Record<StateCategory, { color: string; label: string }> = {
  new: { color: "#a1a1aa", label: "Nuevo" },
  active: { color: "#3b9eff", label: "En curso" },
  blocked: { color: "#f97316", label: "Bloqueado" },
  review: { color: "#a78bfa", label: "Por revisar" },
  done: { color: "#22c55e", label: "Cerrado" },
  removed: { color: "#64748b", label: "Removido" },
};

const categorize = (state: string): StateCategory => {
  const value = state.trim().toLowerCase();
  if (value === "new" || value === "not approve") return "new";
  if (value.startsWith("standby")) return "blocked";
  if (value === "resolved") return "review";
  if (value === "closed") return "done";
  if (value === "removed") return "removed";
  return "active";
};

const when = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return "hace minutos";
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} d`;
};

function Kpi({
  icon,
  label,
  value,
  hint,
  color,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
  readonly hint: string;
  readonly color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-card px-4 py-3">
      <span className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

type Filter = "all" | StateCategory;

type SelectedPr = { projectId: ProjectId; repository: string; number: number; host: string };

const getShortcutContext = () => ({
  terminalFocus: false,
  terminalOpen: false,
  previewFocus: false,
  previewOpen: false,
  modelPickerOpen: false,
  isWeb: !isElectron,
  isDesktop: isElectron,
});

const normalizeRemote = (url: string) =>
  url
    .trim()
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");

export function AzureDashboardPage() {
  const environmentId = usePrimaryEnvironmentId();
  const t3Projects = useProjects();
  const [project, setProject] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<{ project: string; id: number } | null>(null);
  const [selectedPr, setSelectedPr] = useState<SelectedPr | null>(null);
  const [prNotice, setPrNotice] = useState<string | null>(null);

  const config = useEnvironmentQuery(
    environmentId ? azureDevOps.config({ environmentId, input: {} }) : null,
  );
  const ready = config.data?.connected === true;
  const projects = useEnvironmentQuery(
    environmentId && ready ? azureDevOps.projects({ environmentId, input: {} }) : null,
  );
  const myItems = useEnvironmentQuery(
    environmentId && ready ? azureDevOps.myWorkItems({ environmentId, input: {} }) : null,
  );
  const pullRequests = useEnvironmentQuery(
    environmentId && ready && project
      ? azureDevOps.pullRequests({ environmentId, input: { project } })
      : null,
  );
  const threads = useThreadShells();

  const allItems = useMemo(() => myItems.data ?? [], [myItems.data]);
  const items = useMemo(
    () => (project ? allItems.filter((item) => item.project === project) : allItems),
    [allItems, project],
  );
  const counts = useMemo(() => {
    const bucket: Record<StateCategory, number> = {
      new: 0,
      active: 0,
      blocked: 0,
      review: 0,
      done: 0,
      removed: 0,
    };
    for (const item of items) bucket[categorize(item.state)] += 1;
    return bucket;
  }, [items]);
  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => categorize(item.state) === filter)),
    [items, filter],
  );
  const activeThreads = useMemo(
    () => threads.filter((t) => t.environmentId === environmentId && t.archivedAt === null),
    [threads, environmentId],
  );
  const prs = pullRequests.data ?? [];

  // The T3 pull-request panel is keyed by a local T3 project, so match this Azure
  // repository to one of the user's T3 projects before routing to that panel.
  const openPullRequest = (pr: AzureDevOpsPullRequest) => {
    if (!environmentId) return;
    const organization = config.data?.organization ?? "";
    const remote = pr.repositoryRemoteUrl ? normalizeRemote(pr.repositoryRemoteUrl) : "";
    const repoFull =
      organization && pr.repositoryName ? `${organization}/${pr.repositoryName}`.toLowerCase() : "";
    const owner = t3Projects.find((entry) => {
      if (entry.environmentId !== environmentId) return false;
      const identity = entry.repositoryIdentity;
      if (!identity) return false;
      if (
        repoFull &&
        identity.owner &&
        identity.name &&
        `${identity.owner}/${identity.name}`.toLowerCase() === repoFull
      )
        return true;
      return Boolean(remote) && normalizeRemote(identity.locator.remoteUrl) === remote;
    });
    const identity = owner?.repositoryIdentity;
    if (!owner || !identity?.owner || !identity.name) {
      setPrNotice(
        "No encuentro el proyecto T3 de esta PR. Añade el repositorio como proyecto o revisa Ajustes → Source control.",
      );
      return;
    }
    setPrNotice(null);
    setSelectedPr({
      projectId: owner.id,
      repository: `${identity.owner}/${identity.name}`,
      number: pr.id,
      host: "dev.azure.com",
    });
  };

  if (selected && environmentId && config.data) {
    return (
      <SidebarInset className="min-w-0">
        <WorkspacePageHeader>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            <ArrowLeftIcon /> Volver
          </Button>
          <span className="text-sm text-muted-foreground">
            Work item #{selected.id} · {selected.project}
          </span>
        </WorkspacePageHeader>
        <div className="h-[calc(100vh-var(--workspace-topbar-height))]">
          <WorkItemDetail
            environmentId={environmentId}
            organization={config.data.organization}
            project={selected.project}
            workItemId={selected.id}
          />
        </div>
      </SidebarInset>
    );
  }

  if (selectedPr && environmentId) {
    return (
      <SidebarInset className="min-w-0">
        <WorkspacePageHeader>
          <Button variant="ghost" size="sm" onClick={() => setSelectedPr(null)}>
            <ArrowLeftIcon /> Volver
          </Button>
          <GitPullRequestIcon className="size-4 text-amber-500" />
          <span className="text-sm text-muted-foreground">Pull request #{selectedPr.number}</span>
        </WorkspacePageHeader>
        <div className="h-[calc(100vh-var(--workspace-topbar-height))]">
          <PullRequestDetailPanel
            environmentId={environmentId}
            shortcutsEnabled
            getShortcutContext={getShortcutContext}
            context="page"
            reference={selectedPr}
            onClose={() => setSelectedPr(null)}
          />
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <LayoutDashboardIcon className="size-4 text-primary" />
        <h1 className="text-base font-semibold">Azure Dashboard</h1>
        <span className="text-xs text-muted-foreground">
          {config.data?.organization ?? "Sin conectar"}
        </span>
      </WorkspacePageHeader>
      <main className="flex h-[calc(100vh-var(--workspace-topbar-height))] flex-col gap-3 overflow-hidden px-5 py-4">
        {!environmentId ? (
          <p>Conecta un entorno para ver tu dashboard.</p>
        ) : !ready ? (
          <div className="mx-auto max-w-xl space-y-3 rounded-lg border p-4">
            <h2 className="font-medium">Azure DevOps no está listo</h2>
            <p className="text-sm text-muted-foreground">
              {config.isPending
                ? "Comprobando la configuración…"
                : (config.error ??
                  "Hacen falta la organización y el token en Ajustes. Se guardan al pegarlos.")}
            </p>
            <Link to="/settings/source-control" className="text-sm underline">
              Abrir Ajustes → Source control
            </Link>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <ServerIcon className="size-4 text-muted-foreground" />
                <select
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  value={project}
                  onChange={(event) => {
                    setProject(event.target.value);
                    setFilter("all");
                  }}
                >
                  <option value="">Todos los proyectos</option>
                  {(projects.data ?? []).map((entry) => (
                    <option key={entry.id} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  projects.refresh();
                  myItems.refresh();
                  pullRequests.refresh();
                }}
              >
                <RefreshCwIcon /> Actualizar
              </Button>
              <span className="text-xs text-muted-foreground">
                Work items asignados a ti en {project ? project : "toda la organización"}.
              </span>
              {myItems.error ? (
                <p className="w-full text-sm text-destructive">{myItems.error}</p>
              ) : null}
            </div>

            <div
              className="grid shrink-0 gap-3"
              style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
            >
              <Kpi
                icon={<ClipboardListIcon className="size-3.5" />}
                label="Asignados a mí"
                value={items.length}
                hint={`${counts.active} en curso`}
                color="#818cf8"
              />
              <Kpi
                icon={<GitPullRequestIcon className="size-3.5" />}
                label="PR activos"
                value={prs.length}
                hint={project ? project : "elige un proyecto"}
                color="#f59e0b"
              />
              <Kpi
                icon={<CircleAlertIcon className="size-3.5" />}
                label="Bloqueados"
                value={counts.blocked}
                hint="standby"
                color={STATE_CATEGORY.blocked.color}
              />
              <Kpi
                icon={<ClipboardListIcon className="size-3.5" />}
                label="Por revisar"
                value={counts.review}
                hint="resolved"
                color={STATE_CATEGORY.review.color}
              />
              <Kpi
                icon={<LayoutDashboardIcon className="size-3.5" />}
                label="Hilos activos"
                value={activeThreads.length}
                hint="en este equipo"
                color={STATE_CATEGORY.done.color}
              />
            </div>

            <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
                <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                  <ClipboardListIcon className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">Tus work items</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {items.length}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    ordenado por última actualización
                  </span>
                </header>
                <div className="flex shrink-0 flex-wrap gap-1.5 border-b px-4 py-2">
                  {(
                    [
                      ["all", "Todos", items.length],
                      ["active", "En curso", counts.active],
                      ["review", "Por revisar", counts.review],
                      ["blocked", "Bloqueados", counts.blocked],
                      ["new", "Nuevos", counts.new],
                      ["done", "Cerrados", counts.done],
                    ] as const
                  ).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`rounded-full px-2.5 py-1 text-[11.5px] ${
                        filter === key
                          ? "bg-primary/15 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label} {count}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {myItems.isPending && allItems.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Cargando tus work items…</p>
                  ) : visible.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nada con este filtro.</p>
                  ) : (
                    visible.map((item) => {
                      const category = categorize(item.state);
                      return (
                        <button
                          key={`${item.project}-${item.id}`}
                          type="button"
                          onClick={() => setSelected({ project: item.project, id: item.id })}
                          className="flex w-full items-center gap-3 border-b border-l-2 px-4 py-2.5 text-left hover:bg-muted/60"
                          style={{ borderLeftColor: STATE_CATEGORY[category].color }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="font-semibold text-primary">#{item.id}</span>
                              <span className="rounded-full bg-muted px-2 py-0.5">{item.type}</span>
                              {!project ? (
                                <span className="truncate text-muted-foreground">
                                  {item.project}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-[13px] font-medium">
                              {item.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span
                                className="inline-flex items-center gap-1"
                                style={{ color: STATE_CATEGORY[category].color }}
                              >
                                <span
                                  className="size-1.5 rounded-full"
                                  style={{ backgroundColor: STATE_CATEGORY[category].color }}
                                />
                                {item.state}
                              </span>
                              <span>· {when(item.changedAt)}</span>
                            </div>
                          </div>
                          <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <div className="flex min-h-0 flex-col gap-3">
                <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
                  <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                    <GitPullRequestIcon className="size-4 text-amber-500" />
                    <h2 className="text-sm font-semibold">Pull requests</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {prs.length}
                    </span>
                    <Link
                      to="/settings/source-control"
                      title="Configurar Azure DevOps, PRs y credenciales"
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <SettingsIcon className="size-3.5" /> Configurar
                    </Link>
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {prNotice ? (
                      <p className="border-b bg-muted/40 px-4 py-2 text-[12px] text-muted-foreground">
                        {prNotice}
                      </p>
                    ) : null}
                    {pullRequests.error ? (
                      <p className="p-4 text-sm text-destructive">{pullRequests.error}</p>
                    ) : !project ? (
                      <p className="p-4 text-[12.5px] text-muted-foreground">
                        Elige un proyecto arriba para ver sus pull requests activos. En "Todos" los
                        PR llegan con la canalización de T3.
                      </p>
                    ) : pullRequests.isPending && prs.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">Cargando pull requests…</p>
                    ) : prs.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">Sin PR activos.</p>
                    ) : (
                      prs.map((pr) => (
                        <button
                          key={`${pr.repositoryId}-${pr.id}`}
                          type="button"
                          onClick={() => openPullRequest(pr)}
                          className="block w-full border-b px-4 py-2.5 text-left hover:bg-muted/60"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-primary">#{pr.id}</span>
                            <span className="truncate text-[13px] font-medium">{pr.title}</span>
                            {pr.isDraft ? (
                              <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                borrador
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                            {pr.targetBranch} ← {pr.sourceBranch} · {pr.createdBy} · {pr.status}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <section className="shrink-0 rounded-xl border bg-card p-3.5">
                  <div className="flex items-center gap-2">
                    <ClipboardListIcon className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold">Jira</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Próximamente
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    Conecta tu token de Jira en Ajustes → Integraciones para ver tus issues junto a
                    los de Azure.
                  </p>
                </section>
              </div>
            </div>

            <div className="grid shrink-0 gap-3" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
              <section className="overflow-hidden rounded-xl border bg-card">
                <header className="flex items-center gap-2 border-b px-4 py-2">
                  <LayoutDashboardIcon className="size-3.5 text-emerald-500" />
                  <h2 className="text-sm font-semibold">Tus hilos activos</h2>
                </header>
                {activeThreads.length === 0 ? (
                  <p className="px-4 py-3 text-[12.5px] text-muted-foreground">
                    Sin hilos activos en este equipo.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
                    {activeThreads.slice(0, 6).map((thread) => (
                      <span key={thread.id} className="flex items-center gap-2 text-[12.5px]">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        {thread.title || thread.id}
                      </span>
                    ))}
                  </div>
                )}
              </section>
              <section className="overflow-hidden rounded-xl border bg-card">
                <header className="flex items-center gap-2 border-b px-4 py-2">
                  <ClipboardListIcon className="size-3.5 text-primary" />
                  <h2 className="text-sm font-semibold">Resumen de estados</h2>
                </header>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    {(
                      ["active", "review", "blocked", "new", "done", "removed"] as StateCategory[]
                    ).map((category) =>
                      counts[category] > 0 ? (
                        <span
                          key={category}
                          style={{
                            width: `${(counts[category] / Math.max(items.length, 1)) * 100}%`,
                            backgroundColor: STATE_CATEGORY[category].color,
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {(["active", "review", "blocked", "done"] as StateCategory[]).map(
                      (category) => (
                        <span key={category} className="inline-flex items-center gap-1">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: STATE_CATEGORY[category].color }}
                          />
                          {STATE_CATEGORY[category].label} {counts[category]}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </SidebarInset>
  );
}
