import { azureDevOpsIssueKey, type EnvironmentId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CircleAlertIcon,
  LayoutGridIcon,
  ListIcon,
  ListTodoIcon,
  SearchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { azureDevOps } from "../../state/azureDevOps";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogPanel, DialogTitle } from "../ui/dialog";
import { RefreshIcon } from "../ui/refresh-icon";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { azureWorkItemFailureNotice } from "../chat/azureWorkItemNotice";
import { IssueBoard } from "./IssueBoard";
import { IssueCalendar } from "./IssueCalendar";
import { IssueDetail, type IssueDetailChanges } from "./IssueDetail";
import { IssueList } from "./IssueList";
import { IssueTasks } from "./IssueTasks";
import { ISSUE_WORK_ITEM_TYPE, relativeTime, sprintsFromItems } from "./issueVisuals";

type View = "tasks" | "list" | "board" | "calendar";
type Notice = { tone: "ok" | "error"; text: string } | null;

const VIEWS: ReadonlyArray<{ key: View; label: string; icon: typeof ListIcon }> = [
  { key: "tasks", label: "Tareas", icon: ListTodoIcon },
  { key: "list", label: "Lista", icon: ListIcon },
  { key: "board", label: "Tablero", icon: LayoutGridIcon },
  { key: "calendar", label: "Calendario", icon: CalendarDaysIcon },
];

const PROJECT_STORAGE_KEY = "upcode:issues:project";
const VIEW_STORAGE_KEY = "upcode:issues:view";
const DENSITY_STORAGE_KEY = "upcode:issues:density";

/** Comfortable is Jira-like; compact fits every column on a laptop screen. */
type Density = "comoda" | "compacta";

/**
 * One project and one view at a time; both stick, because the first project ADO
 * answers with is rarely the one you work in.
 */
function readStoredView(): View {
  const stored = localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "tasks" || stored === "list" || stored === "calendar" || stored === "board"
    ? stored
    : "board";
}

/** The section fills the window, so it carries its own way back. */
function IssuesHeader({ subtitle }: { readonly subtitle?: string }) {
  const navigateToMainApp = useNavigateToMainApp();
  return (
    <WorkspacePageHeader>
      <Button variant="ghost" size="sm" onClick={navigateToMainApp}>
        <ArrowLeftIcon className="size-3.5" />
        Volver
      </Button>
      <h1 className="text-base font-semibold">DevOps</h1>
      {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
    </WorkspacePageHeader>
  );
}

export function IssuesPage() {
  const environmentId = usePrimaryEnvironmentId();
  const config = useEnvironmentQuery(
    environmentId ? azureDevOps.config({ environmentId, input: {} }) : null,
  );

  if (!environmentId) {
    return (
      <SidebarInset className="min-w-0">
        <IssuesHeader />
        <main className="p-5">
          <p className="text-sm">Conecta un entorno para consultar Azure DevOps.</p>
        </main>
      </SidebarInset>
    );
  }

  if (config.data?.connected !== true) {
    return (
      <SidebarInset className="min-w-0">
        <IssuesHeader subtitle="Sin conectar" />
        <main className="p-5">
          <div className="mx-auto max-w-xl space-y-3 rounded-lg border p-4">
            <h2 className="font-medium">Azure DevOps no está listo</h2>
            <p className="text-sm text-muted-foreground">
              {config.isPending
                ? "Comprobando la configuración…"
                : (config.error ??
                  "Hacen falta la organización y el token en Ajustes. Se guardan al pegarlos.")}
            </p>
            <div className="flex gap-3 text-sm">
              <Link to="/settings/source-control" className="underline">
                Abrir Ajustes → Source control
              </Link>
              <button type="button" className="underline" onClick={() => config.refresh()}>
                Comprobar de nuevo
              </button>
            </div>
          </div>
        </main>
      </SidebarInset>
    );
  }

  return <IssuesWorkspace environmentId={environmentId} organization={config.data.organization} />;
}

function IssuesWorkspace({
  environmentId,
  organization,
}: {
  readonly environmentId: EnvironmentId;
  readonly organization: string;
}) {
  const [project, setProject] = useState(() => localStorage.getItem(PROJECT_STORAGE_KEY) ?? "");
  const [view, setView] = useState<View>(readStoredView);
  const [density, setDensity] = useState<Density>(() =>
    localStorage.getItem(DENSITY_STORAGE_KEY) === "compacta" ? "compacta" : "comoda",
  );
  const [assignedToMe, setAssignedToMe] = useState(true);
  const [iteration, setIteration] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /** The project of the open item: the tasks view lists several, so it cannot be the selector's. */
  const [detailProject, setDetailProject] = useState("");
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const [boardNotice, setBoardNotice] = useState<Notice>(null);
  const [detailNotice, setDetailNotice] = useState<Notice>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (project) localStorage.setItem(PROJECT_STORAGE_KEY, project);
  }, [project]);
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const projects = useEnvironmentQuery(azureDevOps.projects({ environmentId, input: {} }));
  const selectedProject = project || projects.data?.[0]?.name || "";
  const activeProject = detailProject || selectedProject;
  const workItems = useEnvironmentQuery(
    selectedProject
      ? azureDevOps.workItems({
          environmentId,
          input: {
            project: selectedProject,
            assignedToMe,
            type: ISSUE_WORK_ITEM_TYPE,
            ...(iteration ? { iteration } : {}),
            ...(debouncedSearch ? { query: debouncedSearch } : {}),
          },
        })
      : null,
  );
  /**
   * The sprint catalogue reads the project without the board filters, so the
   * sprint selector still offers the sprints this filter hides.
   */
  const catalogue = useEnvironmentQuery(
    selectedProject
      ? azureDevOps.workItems({
          environmentId,
          input: { project: selectedProject, assignedToMe: false, type: ISSUE_WORK_ITEM_TYPE },
        })
      : null,
  );
  const items = workItems.data ?? [];
  /**
   * The tasks view reads every project at once. No project in the request means one
   * organisation-wide query on the server, not one list per project stitched here.
   */
  const everyProjectWorkItems = useEnvironmentQuery(
    view === "tasks"
      ? azureDevOps.workItems({
          environmentId,
          input: {
            assignedToMe,
            type: ISSUE_WORK_ITEM_TYPE,
            ...(debouncedSearch ? { query: debouncedSearch } : {}),
          },
        })
      : null,
  );
  const visibleItems = view === "tasks" ? (everyProjectWorkItems.data ?? []) : items;
  const visibleError = view === "tasks" ? everyProjectWorkItems.error : workItems.error;
  const sprints = useMemo(() => sprintsFromItems(catalogue.data ?? items), [catalogue.data, items]);
  /**
   * The board's columns are the states ADO defines for the type, and the existing
   * work-item read already returns them ordered and coloured. Any item of the type
   * carries the same list, so the board borrows the first one.
   */
  const columnSourceId = items[0]?.id ?? catalogue.data?.[0]?.id ?? null;
  const columnSource = useEnvironmentQuery(
    selectedProject && columnSourceId !== null
      ? azureDevOps.workItem({
          environmentId,
          input: { project: selectedProject, id: columnSourceId },
        })
      : null,
  );
  const states = columnSource.data?.states ?? [];
  const detail = useEnvironmentQuery(
    activeProject && selectedId !== null
      ? azureDevOps.workItem({
          environmentId,
          input: { project: activeProject, id: selectedId },
        })
      : null,
  );
  const labelMap = useEnvironmentSettings(
    environmentId,
    (settings) => settings.azureDevOpsIssueLabels,
  );
  const detailItem = detail.data ?? null;
  const updateWorkItem = useAtomCommand(azureDevOps.updateWorkItem);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });

  const labelsFor = useMemo(
    () => (itemId: number) => labelMap[azureDevOpsIssueKey(activeProject, itemId)] ?? [],
    [labelMap, activeProject],
  );
  const knownLabels = useMemo(
    () =>
      [...new Set(Object.values(labelMap).flat())].sort((left, right) => left.localeCompare(right)),
    [labelMap],
  );
  const people = useMemo(() => {
    const names = new Set<string>();
    for (const item of visibleItems) if (item.assignedTo) names.add(item.assignedTo);
    const current = detail.data?.assignedTo;
    if (current) names.add(current);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [visibleItems, detail.data?.assignedTo]);

  const write = async (input: IssueDetailChanges & { id: number }) =>
    await updateWorkItem({
      environmentId,
      input: { project: activeProject, ...input },
    });

  const moveIssue = async (itemId: number, state: string) => {
    setBoardNotice(null);
    setBusyIds((current) => new Set(current).add(itemId));
    const result = await write({ id: itemId, state });
    setBusyIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    if (result._tag === "Success") {
      setBoardNotice({ tone: "ok", text: `#${itemId} → ${state} en Azure DevOps.` });
      workItems.refresh();
      catalogue.refresh();
      columnSource.refresh();
      detail.refresh();
      return;
    }
    setBoardNotice({
      tone: "error",
      text: `#${itemId}: ${azureWorkItemFailureNotice(squashAtomCommandFailure(result))}`,
    });
  };

  const saveLabels = async (itemId: number, next: readonly string[]) => {
    const key = azureDevOpsIssueKey(activeProject, itemId);
    const merged = { ...labelMap };
    if (next.length === 0) delete merged[key];
    else merged[key] = [...next];
    await updateSettings({ environmentId, input: { patch: { azureDevOpsIssueLabels: merged } } });
  };

  const saveDetail = async (itemId: number, changes: IssueDetailChanges) => {
    setSavingDetail(true);
    setDetailNotice(null);
    const result = await write({ ...changes, id: itemId });
    setSavingDetail(false);
    if (result._tag === "Success") {
      setDetailNotice({ tone: "ok", text: "Publicado en Azure DevOps." });
      detail.refresh();
      workItems.refresh();
      catalogue.refresh();
      columnSource.refresh();
      return;
    }
    setDetailNotice({
      tone: "error",
      text: azureWorkItemFailureNotice(squashAtomCommandFailure(result)),
    });
  };

  const stale = visibleError !== null && visibleItems.length > 0;
  const freshness = workItems.dataUpdatedAt
    ? (relativeTime(new Date(workItems.dataUpdatedAt).toISOString(), now) ?? "ahora")
    : null;

  const openIssue = (itemId: number, itemProject?: string) => {
    setDetailNotice(null);
    setDetailProject(itemProject ?? "");
    setSelectedId(itemId);
  };

  return (
    <SidebarInset className="min-w-0">
      <IssuesHeader subtitle={`${organization} · ${ISSUE_WORK_ITEM_TYPE}`} />

      <div className="flex h-[calc(100vh-var(--workspace-topbar-height))] min-h-0 min-w-0">
        <nav
          aria-label="Vistas y filtros de Issues"
          className="flex w-48 shrink-0 flex-col gap-4 border-r p-3"
        >
          <div className="flex flex-col gap-1">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-current={view === key}
                onClick={() => setView(key)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${
                  view === key
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {view === "tasks" ? (
            <p className="rounded border border-dashed px-2 py-1.5 text-3xs leading-relaxed text-muted-foreground">
              Todos los proyectos, agrupadas por sprint.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                  Proyecto
                </span>
                <select
                  value={selectedProject}
                  onChange={(event) => {
                    setProject(event.target.value);
                    setIteration("");
                    setSelectedId(null);
                    setDetailProject("");
                  }}
                  className="rounded border bg-background px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {(projects.data ?? []).map((entry) => (
                    <option key={entry.id} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                  Sprint
                </span>
                <select
                  value={iteration}
                  onChange={(event) => setIteration(event.target.value)}
                  className="rounded border bg-background px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <option value="">Todos los sprints</option>
                  {sprints.map((sprint) => (
                    <option key={sprint.path} value={sprint.path}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={assignedToMe}
              onChange={(event) => setAssignedToMe(event.target.checked)}
            />
            Solo asignadas a mí
          </label>

          {view === "board" ? (
            <div className="flex flex-col gap-1">
              <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                Ancho del tablero
              </span>
              <div className="flex gap-1" role="group" aria-label="Ancho del tablero">
                {(["comoda", "compacta"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={density === option}
                    onClick={() => setDensity(option)}
                    className={`flex-1 rounded border px-1.5 py-1 text-2xs transition-colors ${
                      density === option
                        ? "border-ring bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {option === "comoda" ? "Cómodo" : "Compacto"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">Buscar</span>
            <span className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="#ID o título"
                className="w-full rounded border bg-background py-1 pl-7 pr-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              />
            </span>
          </label>

          <div className="mt-auto flex flex-col gap-1 text-3xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                workItems.refresh();
                catalogue.refresh();
                columnSource.refresh();
                projects.refresh();
              }}
            >
              <RefreshIcon className="size-3.5" />
              Actualizar
            </Button>
            <span>{freshness ? `Azure: datos de ${freshness}` : "Sin datos todavía"}</span>
            <span className="font-mono">{visibleItems.length} tareas</span>
          </div>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-2 p-3">
          {stale || visibleError ? (
            <p className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-2xs text-destructive">
              <CircleAlertIcon className="size-3.5 shrink-0" />
              {stale
                ? `Azure no responde ahora mismo; esto es lo último que se pudo leer (${freshness ?? "sin fecha"}).`
                : (visibleError ?? "")}
            </p>
          ) : null}
          {boardNotice ? (
            <p
              className={`rounded border px-2 py-1 text-2xs ${
                boardNotice.tone === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {boardNotice.text}
            </p>
          ) : null}

          {view === "tasks" ? (
            <IssueTasks
              items={visibleItems}
              states={states}
              onOpen={(item) => openIssue(item.id, item.project)}
            />
          ) : view === "board" ? (
            <IssueBoard
              items={items}
              states={states}
              density={density}
              labelsFor={(item) => labelsFor(item.id)}
              now={now}
              busyIds={busyIds}
              onOpen={(item) => openIssue(item.id)}
              onMove={(item, state) => void moveIssue(item.id, state)}
            />
          ) : view === "list" ? (
            <IssueList
              items={items}
              states={states}
              labelsFor={(item) => labelsFor(item.id)}
              now={now}
              onOpen={(item) => openIssue(item.id)}
            />
          ) : (
            <IssueCalendar
              items={items}
              iterations={sprints}
              states={states}
              labelsFor={(item) => labelsFor(item.id)}
              now={now}
              onOpen={(item) => openIssue(item.id)}
            />
          )}
        </main>
      </div>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setDetailProject("");
          }
        }}
      >
        {selectedId !== null && !detailItem ? (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tarea #{selectedId}</DialogTitle>
            </DialogHeader>
            <DialogPanel>{detail.error ?? "Leyendo la tarea de Azure DevOps…"}</DialogPanel>
          </DialogContent>
        ) : null}
        {detailItem ? (
          <IssueDetail
            key={detailItem.id}
            item={detailItem}
            states={detailItem.states ?? states}
            iterations={sprints}
            people={people}
            labels={labelsFor(detailItem.id)}
            knownLabels={knownLabels}
            projectRoot={selectedProject}
            saving={savingDetail}
            notice={detailNotice}
            onClose={() => setSelectedId(null)}
            onSave={(changes) => saveDetail(detailItem.id, changes)}
            onSaveLabels={(next) => saveLabels(detailItem.id, next)}
          />
        ) : null}
      </Dialog>
    </SidebarInset>
  );
}
