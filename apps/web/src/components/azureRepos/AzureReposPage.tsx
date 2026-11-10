import type { AzureDevOpsPullRequest, EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, DatabaseIcon, FolderIcon, RefreshCwIcon, SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import { findProjectForChangeRequest } from "../../lib/openPullRequestLink";
import { azureDevOps } from "../../state/azureDevOps";
import { useProjects } from "../../state/entities";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { AzureDevOpsIcon } from "../Icons";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { AzureCliSettings } from "../settings/AzureCliSettings";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { PullRequestDetailPanel } from "../pullRequest/PullRequestDetailPanel";
import { AzurePicker, AzureReposDashboard, type AzureReposView } from "./AzureReposDashboard";
import { relativeDate } from "./azureReposModel";

export function AzureReposPage() {
  const environmentId = usePrimaryEnvironmentId();
  const back = useNavigateToMainApp();
  return (
    <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
      {environmentId ? (
        <AzureReposWorkspace key={environmentId} environmentId={environmentId} />
      ) : (
        <>
          <WorkspacePageHeader>
            <Button variant="ghost" size="icon" aria-label="Volver" onClick={back}>
              <ArrowLeftIcon />
            </Button>
            <h1 className="font-semibold">Azure DevOps</h1>
          </WorkspacePageHeader>
          <p className="p-6 text-sm text-muted-foreground">
            Conecta un entorno para consultar Azure Repos.
          </p>
        </>
      )}
    </SidebarInset>
  );
}

function AzureReposWorkspace({ environmentId }: { environmentId: EnvironmentId }) {
  const config = useEnvironmentQuery(azureDevOps.config({ environmentId, input: {} }));
  const projects = useEnvironmentQuery(
    config.data?.connected ? azureDevOps.projects({ environmentId, input: {} }) : null,
  );
  const back = useNavigateToMainApp();
  const localProjects = useProjects().filter((project) => project.environmentId === environmentId);
  const storageKey = `upcode:azure-repos:${environmentId}:${config.data?.organization ?? ""}`;
  const readSelection = () => {
    let stored: { project?: string; repository?: string; view?: string } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    } catch {
      /* Use the defaults if browser storage is unavailable. */
    }
    const view: AzureReposView =
      stored?.view === "prs" || stored?.view === "repos" || stored?.view === "activity"
        ? stored.view
        : "summary";
    return {
      key: storageKey,
      project: typeof stored?.project === "string" ? stored.project : "",
      repository: typeof stored?.repository === "string" ? stored.repository : "",
      view,
    };
  };
  const [selection, setSelection] = useState(readSelection);
  if (selection.key !== storageKey) setSelection(readSelection());
  const current = selection.key === storageKey ? selection : null;
  const project =
    projects.data?.find((entry) => entry.name === current?.project)?.name ??
    projects.data?.[0]?.name ??
    "";
  const repositories = useEnvironmentQuery(
    project ? azureDevOps.repositories({ environmentId, input: { project } }) : null,
  );
  const pullRequests = useEnvironmentQuery(
    project ? azureDevOps.pullRequests({ environmentId, input: { project } }) : null,
  );
  const repository = repositories.data?.some((repo) => repo.id === current?.repository)
    ? (current?.repository ?? "")
    : "";
  const [now, setNow] = useState(Date.now);
  const [detail, setDetail] = useState<PullRequestRef | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const change = (patch: Partial<NonNullable<typeof selection>>) => {
    const next = {
      key: storageKey,
      project,
      repository,
      view: current?.view ?? ("summary" as AzureReposView),
      ...patch,
    };
    setSelection(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Session selection still works when storage is unavailable. */
    }
  };
  const refresh = () => {
    config.refresh();
    projects.refresh();
    repositories.refresh();
    pullRequests.refresh();
    setNow(Date.now());
    setNotice(null);
  };
  const openPr = (pr: AzureDevOpsPullRequest) => {
    const parsed = parseChangeRequestUrl(pr.url);
    if (!parsed) {
      setNotice("Azure DevOps devolvió una URL de PR no válida.");
      return;
    }
    const localProject = findProjectForChangeRequest(localProjects, parsed) ?? localProjects[0];
    if (!localProject) {
      setNotice("Añade un proyecto de trabajo a UPCode para abrir el panel de revisión de PR.");
      return;
    }
    setNotice(null);
    setDetail({
      projectId: localProject.id,
      host: parsed.authority ?? parsed.host,
      repository: parsed.repository,
      number: parsed.number,
    });
  };
  const error =
    config.error ?? projects.error ?? repositories.error ?? pullRequests.error ?? notice;
  const connected =
    config.data?.connected === true && !config.error && !projects.error && projects.isSuccess;
  const loading =
    config.isPending || projects.isPending || repositories.isPending || pullRequests.isPending;
  const settingsLink = (
    <Link
      to="/settings/source-control"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <SettingsIcon className="size-3.5" />
      Configurar conexión
    </Link>
  );
  return (
    <>
      <WorkspacePageHeader className="border-b">
        <Button variant="ghost" size="icon" aria-label="Volver" onClick={back}>
          <ArrowLeftIcon />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <AzureDevOpsIcon className="size-6 shrink-0 text-primary" />
          <h1 className="truncate text-base font-semibold lg:text-xl">Azure DevOps</h1>
        </div>
        <span
          role="status"
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-3xs text-muted-foreground"
        >
          <span
            className={
              connected ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-warning"
            }
          />
          {loading ? "Comprobando…" : connected ? "Conectado" : "Sin conexión"}
        </span>
        <div className="hidden 2xl:block">{settingsLink}</div>
      </WorkspacePageHeader>
      {config.data?.connected ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
            <AzurePicker
              label="Organización"
              value={config.data.organization}
              options={[{ value: config.data.organization, label: config.data.organization }]}
              onChange={() => undefined}
            />
            <AzurePicker
              label="Proyecto"
              icon={<FolderIcon className="size-4 text-primary" />}
              value={project}
              options={(projects.data ?? []).map((entry) => ({
                value: entry.name,
                label: entry.name,
              }))}
              onChange={(value) => {
                change({ project: value, repository: "" });
                setDetail(null);
              }}
            />
            <AzurePicker
              label="Repositorio"
              icon={<DatabaseIcon className="size-4" />}
              value={repository}
              options={[
                { value: "", label: "Todos" },
                ...(repositories.data ?? []).map((repo) => ({ value: repo.id, label: repo.name })),
              ]}
              onChange={(value) => change({ repository: value })}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCwIcon className="size-3.5" />
                {pullRequests.dataUpdatedAt
                  ? `Actualizado ${relativeDate(new Date(pullRequests.dataUpdatedAt).toISOString(), now)}`
                  : "Actualizar"}
              </Button>
              {settingsLink}
            </div>
          </div>
          {error && (
            <div
              role="alert"
              className="flex shrink-0 flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
            >
              <span className="flex-1">{error}</span>
              <Button variant="outline" size="sm" onClick={refresh}>
                Reintentar
              </Button>
            </div>
          )}
          {!project && !projects.isPending && !projects.error ? (
            <p className="p-8 text-sm text-muted-foreground">
              No hay proyectos accesibles en esta organización.
            </p>
          ) : (
            <AzureReposDashboard
              key={`${environmentId}:${config.data.organization}:${project}`}
              repositories={repositories.error ? [] : (repositories.data ?? [])}
              pullRequests={pullRequests.error ? [] : (pullRequests.data ?? [])}
              repositoryId={repository}
              onRepositoryChange={(value) => change({ repository: value })}
              onOpenPullRequest={openPr}
              loading={loading}
              now={now}
              view={current?.view ?? "summary"}
              onViewChange={(view) => change({ view })}
            />
          )}
        </>
      ) : (
        <main className="flex-1 overflow-y-auto scrollbar-gutter-both p-6">
          <div className="mx-auto mt-8 max-w-xl rounded-xl border bg-card/80 p-6 shadow-sm">
            <AzureDevOpsIcon className="mb-4 size-9 text-primary" />
            <h2 className="text-lg font-semibold">Conectar con Azure DevOps</h2>
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {config.isPending
                ? "Comprobando el acceso a Azure DevOps…"
                : (config.error ??
                  "Configura tu organización en Ajustes e inicia sesión con Azure CLI o utiliza un Personal Access Token.")}
            </p>
            <AzureCliSettings environmentId={environmentId} />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {settingsLink}
              <Button variant="outline" size="sm" onClick={refresh} disabled={config.isPending}>
                Comprobar conexión
              </Button>
            </div>
          </div>
        </main>
      )}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="h-[90dvh] max-w-[min(1200px,95vw)]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Pull Request · Azure DevOps</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {detail && (
              <PullRequestDetailPanel
                environmentId={environmentId}
                reference={detail}
                shortcutsEnabled={false}
                getShortcutContext={() => ({
                  terminalFocus: false,
                  terminalOpen: false,
                  previewFocus: false,
                  previewOpen: false,
                  isWeb: true,
                  isDesktop: false,
                })}
                onClose={() => setDetail(null)}
                onBack={() => setDetail(null)}
                onSelectPullRequest={setDetail}
                onActed={() => {
                  pullRequests.refresh();
                  repositories.refresh();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
