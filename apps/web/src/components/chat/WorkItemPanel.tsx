import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ClipboardListIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { azureDevOps } from "../../state/azureDevOps";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { WorkItemDetail } from "./WorkItemDetail";

export function WorkItemPanel({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const [project, setProject] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const config = useEnvironmentQuery(azureDevOps.config({ environmentId, input: {} }));
  const links = useEnvironmentQuery(azureDevOps.threadLinks({ environmentId, input: {} }));
  const link = links.data?.[threadId];
  const ready = config.data?.connected === true;
  const projects = useEnvironmentQuery(
    ready && !link ? azureDevOps.projects({ environmentId, input: {} }) : null,
  );
  const selectedProject = project || projects.data?.[0]?.name || "";
  const items = useEnvironmentQuery(
    ready && !link && selectedProject
      ? azureDevOps.workItems({
          environmentId,
          input: {
            project: selectedProject,
            assignedToMe: false,
            ...(debouncedSearch ? { query: debouncedSearch } : {}),
          },
        })
      : null,
  );
  const linkThread = useAtomCommand(azureDevOps.linkThread);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const assign = async () => {
    const id = Number(pickedId);
    if (!ready || !config.data || !selectedProject || !Number.isInteger(id) || id <= 0) return;
    setSaving(true);
    setNotice(null);
    const result = await linkThread({
      environmentId,
      input: {
        threadId,
        link: { organization: config.data.organization, project: selectedProject, workItemId: id },
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      setPickedId("");
      links.refresh();
    } else setNotice({ tone: "error", text: "No se pudo asignar el work item." });
  };

  if (!ready) {
    return (
      <div className="flex h-full flex-col gap-3 bg-background p-4 text-sm">
        <h2 className="flex items-center gap-2 font-medium">
          <ClipboardListIcon className="size-4 text-primary" /> Work item
        </h2>
        <p className="text-muted-foreground">
          {config.isPending
            ? "Comprobando la configuración…"
            : (config.error ?? "Hacen falta la organización y el token en Ajustes.")}
        </p>
        <Link to="/settings/source-control" className="text-primary underline">
          Abrir Ajustes → Source control
        </Link>
      </div>
    );
  }

  if (link && config.data) {
    return (
      <WorkItemDetail
        environmentId={environmentId}
        organization={config.data.organization}
        project={link.project}
        workItemId={link.workItemId}
        threadId={threadId}
        onUnlinked={() => links.refresh()}
      />
    );
  }

  const results = items.data ?? [];
  return (
    <div className="flex h-full flex-col gap-3 bg-background p-4">
      <h2 className="font-medium">Asignar work item</h2>
      <p className="text-sm text-muted-foreground">
        Busca por número (#) o por texto del título. La que elijas se queda en la tarjeta y se abre
        aquí.
      </p>
      <label className="text-xs text-muted-foreground">
        Proyecto
        <select
          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
          value={selectedProject}
          onChange={(event) => {
            setProject(event.target.value);
            setPickedId("");
            setSearch("");
          }}
        >
          {(projects.data ?? []).map((entry) => (
            <option key={entry.id} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
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
            setPickedId("");
          }}
          className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        />
      </div>
      {items.error ? (
        <p className="text-sm text-destructive">{items.error}</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
          {items.isPending && results.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">Buscando en Azure…</li>
          ) : results.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">
              {debouncedSearch
                ? `Nada coincide con «${debouncedSearch}».`
                : "Sin work items en este proyecto."}
            </li>
          ) : (
            results.map((entry) => {
              const active = pickedId === String(entry.id);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPickedId(String(entry.id))}
                    className={`flex w-full items-start gap-2 p-2 text-left text-sm ${
                      active ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-medium text-primary">
                      #{entry.id}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{entry.title}</span>
                      <span className="text-2xs text-muted-foreground">
                        {entry.type} · {entry.state}
                        {entry.assignedTo ? ` · ${entry.assignedTo}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
      <Button
        size="sm"
        className="self-start"
        disabled={saving || !pickedId}
        onClick={() => void assign()}
      >
        {pickedId ? `Asignar #${pickedId}` : "Asignar a este hilo"}
      </Button>
      {notice ? (
        <p className={`text-sm ${notice.tone === "error" ? "text-destructive" : "text-primary"}`}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
