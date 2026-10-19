import { useEffect, useRef, useState } from "react";
import {
  CommandId,
  type EnvironmentId,
  type Incident,
  type IncidentEvidence,
  type IncidentStatus,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  FileCodeIcon,
  FileJsonIcon,
  FileTextIcon,
  FileWarningIcon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";

import { incidents } from "../../state/incidents";
import { usePrimaryEnvironmentId, useEnvironments } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { resolveDefaultProviderModelSelection } from "../../providerInstances";
import { randomUUID } from "../../lib/utils";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { Button } from "../ui/button";
import ChatView from "../ChatView";

const STATUS: Record<IncidentStatus, { label: string; className: string }> = {
  open: { label: "Abierta", className: "bg-muted text-muted-foreground" },
  investigating: { label: "Investigando", className: "bg-warning/15 text-warning" },
  resolved: { label: "Resuelta", className: "bg-success/15 text-success" },
};

const when = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es");
};

function prettyContent(evidence: IncidentEvidence): string {
  if (evidence.contentType === "json") {
    try {
      return JSON.stringify(JSON.parse(evidence.content), null, 2);
    } catch {
      return evidence.content;
    }
  }
  return evidence.content;
}

const FILE_EXTENSION: Record<IncidentEvidence["contentType"], string> = {
  json: "json",
  log: "log",
  table: "md",
  text: "md",
  http: "http",
  error: "log",
};

const evidenceFileName = (evidence: IncidentEvidence) =>
  `${evidence.title}.${FILE_EXTENSION[evidence.contentType]}`;

function EvidenceFileIcon({
  contentType,
}: {
  readonly contentType: IncidentEvidence["contentType"];
}) {
  if (contentType === "json") return <FileJsonIcon className="size-3.5 shrink-0 text-warning" />;
  if (contentType === "log" || contentType === "error")
    return <FileWarningIcon className="size-3.5 shrink-0 text-error" />;
  if (contentType === "http") return <FileCodeIcon className="size-3.5 shrink-0 text-info" />;
  return <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

/** Obsidian-style viewer: opens one collected file over the incident. */
function EvidenceViewer({
  evidence,
  onClose,
}: {
  readonly evidence: IncidentEvidence;
  readonly onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const meta = Object.entries(evidence.metadata ?? {});
  const copy = async () => {
    await navigator.clipboard.writeText(prettyContent(evidence)).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
          <EvidenceFileIcon contentType={evidence.contentType} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{evidenceFileName(evidence)}</span>
            <span className="block text-2xs text-muted-foreground">
              {evidence.source} · {evidence.contentType} · {when(evidence.capturedAt)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ClipboardCopyIcon className="size-3.5" /> {copied ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cerrar
          </button>
        </header>
        {meta.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-1 border-b bg-muted/20 px-4 py-2">
            {meta.map(([key, value]) => (
              <span key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-3xs">
                <span className="text-muted-foreground">{key}</span> {value}
              </span>
            ))}
          </div>
        ) : null}
        {evidence.summary ? (
          <p className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">
            {evidence.summary}
          </p>
        ) : null}
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed">
          {prettyContent(evidence)}
        </pre>
      </div>
    </div>
  );
}

function InvestigationPanel({
  environmentId,
  incident,
  onChanged,
}: {
  readonly environmentId: EnvironmentId;
  readonly incident: Incident;
  readonly onChanged: () => void;
}) {
  const [tab, setTab] = useState<"files" | "summary">("files");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewing, setViewing] = useState<IncidentEvidence | null>(null);
  const mutate = useAtomCommand(incidents.mutate);
  const sources = new Map<string, IncidentEvidence[]>();
  for (const entry of incident.evidence) {
    const list = sources.get(entry.source) ?? [];
    list.push(entry);
    sources.set(entry.source, list);
  }

  return (
    <>
      <aside className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border bg-background lg:w-[400px]">
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
          <ActivityIcon className="ml-1 size-3.5 text-error" />
          <span className="text-xs font-semibold">Investigación</span>
          <div className="ml-auto flex gap-1">
            {(
              [
                ["files", `Archivos ${incident.evidence.length}`],
                ["summary", "Resumen"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-md px-2 py-1 text-2xs ${
                  tab === key
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === "summary" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {incident.summary ? (
              <div className="whitespace-pre-wrap rounded-lg border bg-card p-3 text-xs leading-relaxed">
                {incident.summary}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                El agente no ha escrito todavía un resumen de la investigación.
              </p>
            )}
          </div>
        ) : incident.evidence.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
            <ShieldAlertIcon className="size-8 text-error/40" />
            <p className="max-w-[17rem] text-xs text-muted-foreground">
              Aquí se irán ordenando los ficheros que el agente recopile, en carpetas por fuente.
              Doble clic en uno para abrirlo.
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {[...sources.entries()].map(([source, entries]) => {
              const isCollapsed = collapsed[source] === true;
              return (
                <div key={source} className="mb-0.5">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [source]: !isCollapsed }))}
                    className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left hover:bg-muted/60"
                  >
                    {isCollapsed ? (
                      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-2xs font-semibold uppercase tracking-wide text-error">
                      {source}
                    </span>
                    <span className="ml-auto text-3xs text-muted-foreground">{entries.length}</span>
                  </button>
                  {isCollapsed
                    ? null
                    : entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="group ml-3 flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/60"
                        >
                          <EvidenceFileIcon contentType={entry.contentType} />
                          <button
                            type="button"
                            aria-label={`${evidenceFileName(entry)}, doble clic para abrir`}
                            onDoubleClick={() => setViewing(entry)}
                            className="min-w-0 flex-1 truncate text-left text-xs"
                          >
                            {evidenceFileName(entry)}
                          </button>
                          <button
                            type="button"
                            aria-label="Eliminar evidencia"
                            onClick={async () => {
                              await mutate({
                                environmentId,
                                input: {
                                  action: "evidenceRemove",
                                  id: incident.id,
                                  evidenceId: entry.id,
                                },
                              });
                              onChanged();
                            }}
                            className="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                          >
                            <Trash2Icon className="size-3" />
                          </button>
                        </div>
                      ))}
                </div>
              );
            })}
          </div>
        )}
      </aside>
      {viewing ? <EvidenceViewer evidence={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

function CreateIncident({
  environmentId,
  existingIds,
  onCreated,
}: {
  readonly environmentId: EnvironmentId;
  readonly existingIds: ReadonlySet<string>;
  readonly onCreated: () => void;
}) {
  const mutate = useAtomCommand(incidents.mutate);
  const launchThread = useAtomCommand(incidents.launchThread);
  const projects = useProjects();
  const { environments } = useEnvironments();
  const settings = useEnvironmentSettings(environmentId ?? undefined);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const environmentProjects = projects.filter((project) => project.environmentId === environmentId);
  const selectedProject =
    environmentProjects.find((project) => project.id === projectId) ?? environmentProjects[0];
  const submit = async () => {
    if (!environmentId || !description.trim() || !selectedProject) return;
    setBusy(true);
    setError(null);
    const incidentTitle = title.trim() || description.trim().slice(0, 60);
    const created = await mutate({
      environmentId,
      input: {
        action: "create",
        title: incidentTitle,
        description: description.trim(),
        projectId: selectedProject.id,
      },
    });
    if (created._tag !== "Success") {
      setBusy(false);
      setError("No se pudo crear la incidencia.");
      return;
    }
    const incident = created.value.find((entry) => !existingIds.has(entry.id));
    // The incident launches its own empty conversation, using this project's
    // defaults, so it never reuses (or clashes with) a normal thread.
    const resolved = settings
      ? resolveProjectSettings(settings, selectedProject.id, selectedProject).settings
      : null;
    const providers =
      environments.find((environment) => environment.environmentId === environmentId)?.serverConfig
        ?.providers ?? [];
    const modelSelection = resolveDefaultProviderModelSelection(
      providers,
      resolved?.defaultModelSelection ?? null,
    );
    if (incident && resolved && modelSelection) {
      const launched = await launchThread({
        environmentId,
        input: {
          commandId: CommandId.make(randomUUID()),
          projectId: selectedProject.id,
          title: incidentTitle,
          modelSelection,
          runtimeMode: resolved.defaultRuntimeMode,
          interactionMode: "default",
          workspaceStrategy: { type: "root" },
        },
      });
      if (launched._tag === "Success") {
        await mutate({
          environmentId,
          input: { action: "update", id: incident.id, threadId: launched.value.threadId },
        });
      } else {
        setError("La incidencia se creó, pero no se pudo abrir su conversación.");
      }
    } else if (incident) {
      setError(
        "La incidencia se creó, pero no hay ningún proveedor disponible para su conversación.",
      );
    }
    setBusy(false);
    setTitle("");
    setDescription("");
    onCreated();
  };
  return (
    <div className="space-y-2 rounded-lg border border-error/25 bg-error/5 p-3">
      <p className="text-xs font-medium">Nueva incidencia</p>
      <label className="block text-2xs text-muted-foreground">
        Proyecto
        <select
          className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          value={selectedProject?.id ?? ""}
          onChange={(event) => setProjectId(event.target.value)}
        >
          {environmentProjects.length === 0 ? <option value="">Sin proyectos</option> : null}
          {environmentProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title || project.id}
            </option>
          ))}
        </select>
      </label>
      <input
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        placeholder="Título (opcional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <textarea
        className="min-h-24 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        placeholder="Describe el problema…"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Button
        size="sm"
        disabled={busy || !description.trim() || !selectedProject}
        onClick={() => void submit()}
      >
        <PlusIcon /> Crear incidencia
      </Button>
      {error ? <p className="text-2xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function IncidentCenterPage() {
  const environmentId = usePrimaryEnvironmentId();
  const list = useEnvironmentQuery(
    environmentId ? incidents.list({ environmentId, input: {} }) : null,
  );
  // The agent writes evidence and summaries through MCP tools, not through this
  // client, so the panel polls while it is open instead of waiting for a click.
  const listRef = useRef(list);
  listRef.current = list;
  useEffect(() => {
    const timer = setInterval(() => listRef.current?.refresh(), 5_000);
    return () => clearInterval(timer);
  }, []);
  const mutate = useAtomCommand(incidents.mutate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const items = list.data ?? [];
  const selected = items.find((incident) => incident.id === selectedId) ?? items[0] ?? null;

  const setStatus = async (incident: Incident, status: IncidentStatus) => {
    if (!environmentId) return;
    await mutate({ environmentId, input: { action: "update", id: incident.id, status } });
    list.refresh();
  };

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <ShieldAlertIcon className="size-4 text-error" />
        <h1 className="text-base font-semibold">Incidents</h1>
        <span className="text-xs text-muted-foreground">Investigación de solo lectura</span>
      </WorkspacePageHeader>
      <main className="flex h-[calc(100vh-var(--workspace-topbar-height))] gap-3 overflow-hidden px-4 py-3">
        {/* left: incidents */}
        <section className="flex w-[260px] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border bg-card p-2.5">
          <Button size="sm" variant="outline" onClick={() => setCreating((value) => !value)}>
            <PlusIcon /> Nueva incidencia
          </Button>
          {creating && environmentId ? (
            <CreateIncident
              environmentId={environmentId}
              existingIds={new Set(items.map((incident) => incident.id))}
              onCreated={() => {
                setCreating(false);
                list.refresh();
              }}
            />
          ) : null}
          {list.error ? <p className="text-xs text-destructive">{list.error}</p> : null}
          {!environmentId ? (
            <p className="text-xs text-muted-foreground">Conecta un entorno.</p>
          ) : items.length === 0 && !creating ? (
            <p className="px-1 text-xs text-muted-foreground">Sin incidencias todavía.</p>
          ) : (
            items.map((incident) => {
              const status = STATUS[incident.status];
              const active = selected?.id === incident.id;
              return (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelectedId(incident.id)}
                  className={`rounded-lg border-l-2 px-2.5 py-2 text-left ${
                    active ? "border-error bg-error/10" : "border-transparent hover:bg-muted/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-3xs ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="ml-auto text-3xs text-muted-foreground">
                      {incident.evidence.length} ev.
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs font-medium">{incident.title}</span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {when(incident.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </section>

        {/* center: conversation or detail */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
          {selected ? (
            <>
              <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{selected.title}</span>
                  <span className="block text-2xs text-muted-foreground">
                    {selected.branch ? `${selected.branch} · ` : ""}creada{" "}
                    {when(selected.createdAt)}
                  </span>
                </span>
                {selected.status !== "resolved" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void setStatus(selected, "investigating")}
                    >
                      Investigando
                    </Button>
                    <Button size="sm" onClick={() => void setStatus(selected, "resolved")}>
                      Resolver
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void setStatus(selected, "open")}
                  >
                    Reabrir
                  </Button>
                )}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Eliminar incidencia"
                  onClick={async () => {
                    if (!environmentId) return;
                    await mutate({ environmentId, input: { action: "delete", id: selected.id } });
                    setSelectedId(null);
                    list.refresh();
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </header>
              {selected.threadId && environmentId ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <ChatView
                    environmentId={environmentId}
                    threadId={selected.threadId as never}
                    routeKind="server"
                  />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <p className="max-w-2xl whitespace-pre-wrap text-sm leading-relaxed">
                    {selected.description}
                  </p>
                  <div className="mt-4 flex items-start gap-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                    <FileWarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                    <span>
                      La conversación de investigación aún no está vinculada a esta incidencia. Abre
                      un hilo en el proyecto y quedará aquí, junto al panel de evidencias. Ver{" "}
                      <Link to="/settings/source-control" className="underline">
                        ajustes
                      </Link>{" "}
                      si necesitas configurar accesos.
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <ShieldAlertIcon className="size-10 text-error/40" />
              <p className="text-sm text-muted-foreground">
                Crea una incidencia para empezar a investigar.
              </p>
            </div>
          )}
        </section>

        {/* right: investigation panel */}
        {selected ? (
          environmentId ? (
            <InvestigationPanel
              environmentId={environmentId}
              incident={selected}
              onChanged={() => list.refresh()}
            />
          ) : null
        ) : null}
      </main>
    </SidebarInset>
  );
}
