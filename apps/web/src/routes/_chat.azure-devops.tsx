import { createFileRoute, Link } from "@tanstack/react-router";
import DOMPurify from "dompurify";
import { useMemo, useState, useEffect } from "react";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useThreadShells } from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { azureDevOps } from "../state/azureDevOps";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { Button } from "../components/ui/button";
import { azureWorkItemFailureNotice } from "../components/chat/azureWorkItemNotice";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { ClipboardListIcon, FolderGit2Icon, SearchIcon, UserRoundIcon } from "lucide-react";
import { PullRequestGlyph } from "../components/pullRequest/pullRequestIcons";

export const Route = createFileRoute("/_chat/azure-devops")({ component: AzureDevOpsPage });

type Tab = "mine" | "work-items" | "repositories" | "pull-requests";

const WORK_ITEM_HTML_TAGS = [
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "p",
  "br",
  "div",
  "span",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "code",
  "pre",
  "blockquote",
];

function workItemHtml(value: string): string {
  const clean = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: WORK_ITEM_HTML_TAGS,
    ALLOWED_ATTR: ["href"],
  });
  const document = new DOMParser().parseFromString(clean, "text/html");
  for (const anchor of document.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) {
      anchor.removeAttribute("href");
      continue;
    }
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noreferrer noopener");
  }
  return document.body.innerHTML;
}

function AzureDevOpsPage() {
  const environmentId = usePrimaryEnvironmentId();
  const [project, setProject] = useState("");
  const [tab, setTab] = useState<Tab>("mine");
  const [itemId, setItemId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [selectedPullRequest, setSelectedPullRequest] = useState<{
    id: number;
    repositoryId: string;
  } | null>(null);
  const [threadId, setThreadId] = useState("");
  const [comment, setComment] = useState("");
  const [nextState, setNextState] = useState("");
  const [showWritePreview, setShowWritePreview] = useState(false);
  const [publishNotice, setPublishNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const config = useEnvironmentQuery(
    environmentId ? azureDevOps.config({ environmentId, input: {} }) : null,
  );
  const tokenReady = config.data?.connected === true;
  const projects = useEnvironmentQuery(
    environmentId && tokenReady ? azureDevOps.projects({ environmentId, input: {} }) : null,
  );
  const selectedProject = project || projects.data?.[0]?.name || "";
  const workItems = useEnvironmentQuery(
    environmentId && selectedProject && (tab === "mine" || tab === "work-items")
      ? azureDevOps.workItems({
          environmentId,
          input: {
            project: selectedProject,
            assignedToMe: tab === "mine",
            ...(debouncedSearch ? { query: debouncedSearch } : {}),
          },
        })
      : null,
  );
  const workItem = useEnvironmentQuery(
    environmentId && selectedProject && itemId !== null
      ? azureDevOps.workItem({ environmentId, input: { project: selectedProject, id: itemId } })
      : null,
  );
  const repositories = useEnvironmentQuery(
    environmentId && selectedProject && tab === "repositories"
      ? azureDevOps.repositories({ environmentId, input: { project: selectedProject } })
      : null,
  );
  const branches = useEnvironmentQuery(
    environmentId && selectedProject && repositoryId && tab === "repositories"
      ? azureDevOps.branches({ environmentId, input: { project: selectedProject, repositoryId } })
      : null,
  );
  const pullRequests = useEnvironmentQuery(
    environmentId && selectedProject && tab === "pull-requests"
      ? azureDevOps.pullRequests({ environmentId, input: { project: selectedProject } })
      : null,
  );
  const pullRequestDetail = useEnvironmentQuery(
    environmentId && selectedProject && selectedPullRequest && tab === "pull-requests"
      ? azureDevOps.pullRequestDetail({
          environmentId,
          input: {
            project: selectedProject,
            repositoryId: selectedPullRequest.repositoryId,
            id: selectedPullRequest.id,
          },
        })
      : null,
  );
  const links = useEnvironmentQuery(
    environmentId ? azureDevOps.threadLinks({ environmentId, input: {} }) : null,
  );
  const linkThread = useAtomCommand(azureDevOps.linkThread);
  const updateWorkItem = useAtomCommand(azureDevOps.updateWorkItem);
  const threads = useThreadShells();
  const availableThreads = useMemo(
    () =>
      threads.filter(
        (thread) => thread.environmentId === environmentId && thread.archivedAt === null,
      ),
    [threads, environmentId],
  );
  const linkedThreads = useMemo(
    () =>
      Object.entries(links.data ?? {}).filter(
        ([, link]) =>
          link.organization === config.data?.organization &&
          link.project === selectedProject &&
          link.workItemId === itemId,
      ),
    [links.data, config.data?.organization, selectedProject, itemId],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const workItemStates = workItem.data?.states ?? [];

  const assignThread = async () => {
    if (!environmentId || !threadId || !itemId || !config.data) return;
    await linkThread({
      environmentId,
      input: {
        threadId,
        link: {
          organization: config.data.organization,
          project: selectedProject,
          workItemId: itemId,
        },
      },
    });
    links.refresh();
  };
  const unlinkThread = async (id: string) => {
    if (!environmentId) return;
    await linkThread({ environmentId, input: { threadId: id, link: null } });
    links.refresh();
  };
  const publish = async () => {
    if (!environmentId || itemId === null || (!comment.trim() && !nextState.trim())) return;
    const result = await updateWorkItem({
      environmentId,
      input: {
        project: selectedProject,
        id: itemId,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(nextState.trim() ? { state: nextState.trim() } : {}),
      },
    });
    if (result._tag === "Success") {
      setShowWritePreview(false);
      setComment("");
      setNextState("");
      setPublishNotice({ tone: "ok", text: "Publicado en Azure DevOps." });
      workItem.refresh();
      workItems.refresh();
    } else {
      setPublishNotice({
        tone: "error",
        text: azureWorkItemFailureNotice(squashAtomCommandFailure(result)),
      });
    }
  };

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <h1 className="text-base font-semibold">Azure DevOps</h1>
        <span className="text-xs text-muted-foreground">
          {config.data?.organization ?? "Sin conectar"}
        </span>
      </WorkspacePageHeader>
      <main className="h-[calc(100vh-var(--workspace-topbar-height))] overflow-y-auto px-5 py-5 scrollbar-gutter-both">
        {!environmentId ? (
          <p>Conecta un entorno para consultar Azure DevOps.</p>
        ) : !tokenReady ? (
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
        ) : (
          <div className="mx-auto max-w-6xl space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm">
                Proyecto{" "}
                <select
                  className="ml-2 rounded border bg-background p-2"
                  value={selectedProject}
                  onChange={(event) => {
                    setProject(event.target.value);
                    setItemId(null);
                    setRepositoryId("");
                    setSelectedPullRequest(null);
                  }}
                >
                  {(projects.data ?? []).map((entry) => (
                    <option key={entry.id} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  projects.refresh();
                  workItems.refresh();
                  repositories.refresh();
                  pullRequests.refresh();
                }}
              >
                Actualizar
              </Button>
              <span className="text-xs text-muted-foreground">
                Datos consultados al servidor de Azure DevOps; cada panel muestra errores por
                separado.
              </span>
              {projects.error && (
                <p className="w-full text-sm text-destructive">{projects.error}</p>
              )}
            </div>
            <nav className="flex flex-wrap gap-2" aria-label="Secciones de Azure DevOps">
              {(
                [
                  ["mine", "Mi trabajo", UserRoundIcon],
                  ["work-items", "Work Items", ClipboardListIcon],
                  ["repositories", "Repositorios", FolderGit2Icon],
                  ["pull-requests", "Pull Requests", PullRequestGlyph.pullRequest],
                ] as const
              ).map(([key, label, Icon]) => (
                <Button
                  key={key}
                  variant={tab === key ? "default" : "outline"}
                  onClick={() => {
                    setTab(key);
                    setItemId(null);
                  }}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </nav>

            {(tab === "mine" || tab === "work-items") && (
              <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(360px,2fr)]">
                <section className="space-y-2 rounded-lg border p-3">
                  <h2 className="font-medium">
                    {tab === "mine" ? "Asignados a mí" : "Últimos work items"}
                  </h2>
                  <div className="relative">
                    <SearchIcon
                      aria-hidden
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="search"
                      aria-label="Buscar work item"
                      placeholder="#ID o texto del título"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setItemId(null);
                      }}
                      className="w-full rounded border bg-background py-2 pl-8 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                    />
                  </div>
                  {workItems.error && <p className="text-sm text-destructive">{workItems.error}</p>}
                  {!workItems.error && (workItems.data ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {debouncedSearch
                        ? `Nada coincide con «${debouncedSearch}».`
                        : workItems.isPending
                          ? "Buscando en Azure…"
                          : "Sin work items en este proyecto."}
                    </p>
                  )}
                  {workItems.isPending && (
                    <p className="text-sm text-muted-foreground">Cargando…</p>
                  )}
                  {(workItems.data ?? []).map((item) => (
                    <button
                      key={item.id}
                      className="block w-full rounded-lg border border-primary/20 bg-primary/5 p-2 text-left hover:bg-primary/10"
                      onClick={() => {
                        setItemId(item.id);
                        setShowWritePreview(false);
                      }}
                    >
                      <span className="flex flex-wrap gap-1 text-2xs">
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                          #{item.id}
                        </span>
                        <span className="rounded-full bg-accent px-2 py-0.5">{item.type}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5">{item.state}</span>
                      </span>
                      <span className="mt-1 block text-sm font-medium">{item.title}</span>
                    </button>
                  ))}
                </section>
                <section className="space-y-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
                  {itemId === null ? (
                    <p className="text-muted-foreground">Selecciona un work item.</p>
                  ) : workItem.error ? (
                    <p className="text-destructive">{workItem.error}</p>
                  ) : workItem.data ? (
                    <>
                      <div>
                        <h2 className="text-lg font-semibold">
                          #{workItem.data.id} {workItem.data.title}
                        </h2>
                        <p className="mt-2 flex flex-wrap gap-1 text-xs">
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                            {workItem.data.type}
                          </span>
                          <span className="rounded-full bg-accent px-2 py-0.5 text-accent-foreground">
                            {workItem.data.state}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5">
                            {workItem.data.assignedTo ?? "Sin asignar"}
                          </span>
                        </p>
                        <a
                          href={workItem.data.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-sm text-primary underline"
                        >
                          Abrir en Azure DevOps
                        </a>
                      </div>
                      <div>
                        <h3 className="font-medium">Descripción</h3>
                        {workItem.data.description ? (
                          <div
                            className="max-h-64 overflow-auto text-sm leading-relaxed [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                            dangerouslySetInnerHTML={{
                              __html: workItemHtml(workItem.data.description),
                            }}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">Sin descripción</p>
                        )}
                      </div>
                      <div className="space-y-2 border-t pt-3">
                        <h3 className="font-medium">Conversaciones asociadas</h3>
                        {linkedThreads.map(([id]) => (
                          <div key={id} className="flex items-center gap-2 text-sm">
                            <span>
                              {availableThreads.find((thread) => thread.id === id)?.title ?? id}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void unlinkThread(id)}
                            >
                              Desvincular
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <select
                            className="min-w-0 flex-1 rounded border bg-background p-2 text-sm"
                            value={threadId}
                            onChange={(event) => setThreadId(event.target.value)}
                          >
                            <option value="">Selecciona conversación</option>
                            {availableThreads.map((thread) => (
                              <option key={thread.id} value={thread.id}>
                                {thread.title || thread.id}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="outline"
                            disabled={!threadId}
                            onClick={() => void assignThread()}
                          >
                            Asociar
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 border-t pt-3">
                        <h3 className="font-medium">Actualizar work item</h3>
                        <p className="text-xs text-muted-foreground">
                          Solo se envían los cambios que confirmes aquí.
                        </p>
                        <textarea
                          className="w-full rounded border bg-background p-2 text-sm"
                          placeholder="Comentario de progreso"
                          value={comment}
                          onChange={(event) => setComment(event.target.value)}
                        />
                        <select
                          className="w-full rounded border bg-background p-2 text-sm"
                          aria-label="Nuevo estado"
                          value={nextState}
                          onChange={(event) => setNextState(event.target.value)}
                        >
                          <option value="">Sin cambio de estado</option>
                          {workItemStates.map((state) => (
                            <option
                              key={state.name}
                              value={state.name}
                              disabled={state.name === workItem.data?.state}
                            >
                              {state.name}
                              {state.name === workItem.data?.state ? " · actual" : ""}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={!comment.trim() && !nextState.trim()}
                          onClick={() => {
                            setPublishNotice(null);
                            setShowWritePreview(true);
                          }}
                        >
                          Revisar cambios
                        </Button>
                        {publishNotice && (
                          <p
                            className={`text-sm ${
                              publishNotice.tone === "error" ? "text-destructive" : "text-primary"
                            }`}
                          >
                            {publishNotice.text}
                          </p>
                        )}
                        {showWritePreview && (
                          <div className="space-y-2 rounded border p-3 text-sm">
                            <strong>Vista previa de publicación</strong>
                            <p>Work item #{itemId}</p>
                            {comment.trim() && (
                              <p className="whitespace-pre-wrap">Comentario: {comment}</p>
                            )}
                            {nextState.trim() && (
                              <p>
                                Estado: {workItem.data.state} → {nextState}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <Button onClick={() => void publish()}>
                                Publicar en Azure DevOps
                              </Button>
                              <Button variant="outline" onClick={() => setShowWritePreview(false)}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Cargando…</p>
                  )}
                </section>
              </div>
            )}
            {tab === "repositories" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="space-y-2 rounded-lg border p-3">
                  <h2 className="font-medium">Repositorios</h2>
                  {repositories.error && <p className="text-destructive">{repositories.error}</p>}
                  {(repositories.data ?? []).map((repository) => (
                    <button
                      key={repository.id}
                      className="block w-full rounded border p-2 text-left hover:bg-muted"
                      onClick={() => setRepositoryId(repository.id)}
                    >
                      <span className="font-medium">{repository.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {repository.defaultBranch ?? "Sin rama principal"}
                      </span>
                    </button>
                  ))}
                </section>
                <section className="space-y-2 rounded-lg border p-3">
                  <h2 className="font-medium">Ramas</h2>
                  {branches.error && <p className="text-destructive">{branches.error}</p>}
                  {!repositoryId && (
                    <p className="text-sm text-muted-foreground">Selecciona un repositorio.</p>
                  )}
                  {(branches.data ?? []).map((branch) => (
                    <p key={branch.name} className="border-b py-1 text-sm">
                      {branch.name}
                    </p>
                  ))}
                </section>
              </div>
            )}
            {tab === "pull-requests" && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="space-y-2 rounded-lg border p-3">
                  <h2 className="font-medium">Pull Requests activos</h2>
                  {pullRequests.error && <p className="text-destructive">{pullRequests.error}</p>}
                  {(pullRequests.data ?? []).map((pr) => (
                    <button
                      key={pr.id}
                      onClick={() =>
                        setSelectedPullRequest({ id: pr.id, repositoryId: pr.repositoryId })
                      }
                      className="block w-full rounded border p-3 text-left hover:bg-muted"
                    >
                      <span className="font-medium">
                        #{pr.id} {pr.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {pr.sourceBranch} → {pr.targetBranch} · {pr.createdBy} · {pr.status}
                      </span>
                    </button>
                  ))}
                </section>
                <section className="space-y-3 rounded-lg border p-3">
                  <h2 className="font-medium">Vínculos y quality gate</h2>
                  {!selectedPullRequest && (
                    <p className="text-sm text-muted-foreground">
                      Selecciona un PR para ver su evidencia.
                    </p>
                  )}
                  {selectedPullRequest && (
                    <a
                      href={
                        pullRequests.data?.find(
                          (pr) =>
                            pr.id === selectedPullRequest.id &&
                            pr.repositoryId === selectedPullRequest.repositoryId,
                        )?.url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm underline"
                    >
                      Abrir PR en Azure DevOps
                    </a>
                  )}
                  {pullRequestDetail.error && (
                    <p className="text-sm text-destructive">{pullRequestDetail.error}</p>
                  )}
                  {pullRequestDetail.data && (
                    <>
                      <p className="text-sm">
                        Resultado:{" "}
                        <strong>
                          {pullRequestDetail.data.qualityGate.outcome === "approved"
                            ? "Aprobado"
                            : pullRequestDetail.data.qualityGate.outcome === "failed"
                              ? "Fallido"
                              : "Sin evidencia suficiente"}
                        </strong>
                      </p>
                      <div className="text-sm">
                        <strong>Work items asociados</strong>
                        {pullRequestDetail.data.linkedWorkItemIds.length === 0 ? (
                          <p>Ninguno.</p>
                        ) : (
                          pullRequestDetail.data.linkedWorkItemIds.map((id) => (
                            <p key={id}>
                              #{id} ·{" "}
                              {Object.entries(links.data ?? {})
                                .filter(
                                  ([, link]) =>
                                    link.organization === config.data?.organization &&
                                    link.project === selectedProject &&
                                    link.workItemId === id,
                                )
                                .map(
                                  ([thread]) =>
                                    availableThreads.find((entry) => entry.id === thread)?.title ??
                                    thread,
                                )
                                .join(", ") || "Sin conversación local asociada"}
                            </p>
                          ))
                        )}
                      </div>
                      <div className="text-sm">
                        <strong>Políticas</strong>
                        {pullRequestDetail.data.policies.length === 0 ? (
                          <p>Azure DevOps no devuelve evaluaciones para este PR.</p>
                        ) : (
                          pullRequestDetail.data.policies.map((policy, index) => (
                            <p key={`${policy.name}-${index}`}>
                              {policy.name}: {policy.status}
                              {policy.blocking ? " · obligatoria" : ""}
                            </p>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </SidebarInset>
  );
}
