import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  ClipboardListIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  SaveIcon,
  UnlinkIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { azureDevOps } from "../../state/azureDevOps";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { WORK_ITEM_HTML_CLASS, workItemHtml } from "./workItemHtml";
import { azureWorkItemFailureNotice } from "./azureWorkItemNotice";
import { workItemAzureUrl } from "./ThreadWorkItemControl";
import { WORK_ITEM_BLUE } from "./workItemVisuals";
import { stateVeil } from "../issues/issueVisuals";

const stateColor = (color: string) =>
  /^[0-9a-fA-F]{6}$/.test(color) ? `#${color}` : "var(--primary)";
const when = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es");
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm break-words">{children}</div>
    </div>
  );
}

/**
 * The editable work-item sheet. Shared by the thread side panel and the Azure
 * dashboard. `threadId` is optional: when present the sheet can unlink itself
 * from that thread; when absent it is a standalone editor.
 */
export function WorkItemDetail({
  environmentId,
  organization,
  project,
  workItemId,
  threadId,
  onUnlinked,
}: {
  readonly environmentId: EnvironmentId;
  readonly organization: string;
  readonly project: string;
  readonly workItemId: number;
  readonly threadId?: ThreadId;
  readonly onUnlinked?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [stateName, setStateName] = useState("");
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const workItem = useEnvironmentQuery(
    azureDevOps.workItem({ environmentId, input: { project, id: workItemId } }),
  );
  const updateWorkItem = useAtomCommand(azureDevOps.updateWorkItem);
  const linkThread = useAtomCommand(azureDevOps.linkThread);
  const item = workItem.data;

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setStateName(item.state);
    setComment("");
    setEditing(false);
    setDescription(null);
    setNotice(null);
  }, [item?.id, item?.changedAt]);

  useLayoutEffect(() => {
    if (!editing || !editorRef.current || editorRef.current.innerHTML) return;
    editorRef.current.innerHTML = description ?? workItemHtml(item?.description ?? "");
  }, [description, editing, item?.description]);

  const states = item?.states ?? [];
  const stateOptions = states.some((state) => state.name === (stateName || item?.state))
    ? states
    : item
      ? [{ name: item.state, color: "", category: "" }, ...states]
      : states;
  const selectedColor = stateOptions.find((state) => state.name === stateName)?.color ?? "";
  const descriptionChanged =
    description !== null && description !== workItemHtml(item?.description ?? "");
  const dirty =
    Boolean(item) &&
    (title.trim() !== item?.title ||
      stateName !== item?.state ||
      comment.trim().length > 0 ||
      descriptionChanged);

  const unlink = async () => {
    if (!threadId) return;
    setSaving(true);
    const result = await linkThread({ environmentId, input: { threadId, link: null } });
    setSaving(false);
    if (result._tag === "Success") onUnlinked?.();
  };

  const save = async () => {
    if (!item || !dirty) return;
    if (!title.trim()) {
      setNotice({ tone: "error", text: "El título no puede quedar vacío." });
      return;
    }
    setSaving(true);
    setNotice(null);
    const editedDescription = editing
      ? workItemHtml(editorRef.current?.innerHTML ?? "")
      : description;
    const descriptionPatch =
      editedDescription !== null && editedDescription !== workItemHtml(item.description ?? "")
        ? editedDescription
        : undefined;
    const result = await updateWorkItem({
      environmentId,
      input: {
        project,
        id: workItemId,
        ...(title.trim() !== item.title ? { title: title.trim() } : {}),
        ...(stateName !== item.state ? { state: stateName } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(descriptionPatch !== undefined ? { description: descriptionPatch } : {}),
      },
    });
    setSaving(false);
    if (result._tag === "Success") {
      setNotice({ tone: "ok", text: "Guardado en Azure DevOps." });
      workItem.refresh();
    } else
      setNotice({
        tone: "error",
        text: azureWorkItemFailureNotice(squashAtomCommandFailure(result)),
      });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <ClipboardListIcon className="size-4" style={{ color: WORK_ITEM_BLUE }} />
        <span className="text-sm font-medium" style={{ color: WORK_ITEM_BLUE }}>
          Work item
        </span>
        <a
          href={workItemAzureUrl({ organization, project, workItemId })}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex items-center gap-1 text-xs text-primary underline"
        >
          Abrir en Azure <ExternalLinkIcon className="size-3" />
        </a>
        {threadId ? (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void unlink()}>
            <UnlinkIcon /> Quitar
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {workItem.error ? <p className="text-sm text-destructive">{workItem.error}</p> : null}
        {!item && !workItem.error ? (
          <p className="text-sm text-muted-foreground">Cargando la tarea…</p>
        ) : null}
        {item ? (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>#{item.id}</span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: stateVeil(WORK_ITEM_BLUE, 18), color: WORK_ITEM_BLUE }}
                >
                  {item.type}
                </span>
                <span>{item.project}</span>
              </div>
              <input
                aria-label="Título"
                className="w-full bg-transparent text-lg font-semibold outline-none focus:rounded-md focus:ring-1 focus:ring-inset focus:ring-ring"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4">
              <Fact label="Asignado a">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/15 text-2xs font-medium text-primary">
                    {(item.assignedTo ?? "?").slice(0, 1)}
                  </span>
                  {item.assignedTo ?? "Sin asignar"}
                </span>
              </Fact>
              <Fact label="Estado">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stateColor(selectedColor) }}
                  />
                  <select
                    aria-label="Estado"
                    className="max-w-full rounded-md border bg-background px-2 py-1 text-sm"
                    value={stateName}
                    onChange={(event) => setStateName(event.target.value)}
                  >
                    {stateOptions.map((state) => (
                      <option key={state.name} value={state.name}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                </span>
              </Fact>
              <Fact label="Área">{item.area ?? "—"}</Fact>
              <Fact label="Iteración">{item.iteration ?? "—"}</Fact>
              <Fact label="Razón">{item.reason ?? "—"}</Fact>
              <Fact label="Prioridad">{item.priority ?? "—"}</Fact>
              <Fact label="Creado">
                {item.createdBy
                  ? `${item.createdBy} · ${when(item.createdAt)}`
                  : when(item.createdAt)}
              </Fact>
              <Fact label="Actualizado">{when(item.changedAt)}</Fact>
            </div>
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-medium">Descripción</h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => {
                    if (editing) {
                      const html = workItemHtml(editorRef.current?.innerHTML ?? "");
                      setDescription(html === workItemHtml(item.description ?? "") ? null : html);
                      setEditing(false);
                      return;
                    }
                    setEditing(true);
                  }}
                >
                  {editing ? "Ver" : "Editar"}
                </Button>
              </div>
              {editing ? (
                <div
                  ref={editorRef}
                  contentEditable
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Descripción"
                  className={`min-h-32 rounded-md border border-primary/40 bg-background p-3 outline-none ${WORK_ITEM_HTML_CLASS}`}
                  onInput={() => setDescription(workItemHtml(editorRef.current?.innerHTML ?? ""))}
                />
              ) : description ? (
                <div
                  className={WORK_ITEM_HTML_CLASS}
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              ) : item.description ? (
                <div
                  className={WORK_ITEM_HTML_CLASS}
                  dangerouslySetInnerHTML={{ __html: workItemHtml(item.description) }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Sin descripción</p>
              )}
            </section>
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareIcon className="size-4" /> Discusión
              </h3>
              <textarea
                aria-label="Comentario"
                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                placeholder="Añade un comentario"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              {(item.comments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin comentarios.</p>
              ) : (
                (item.comments ?? []).map((entry) => (
                  <article key={entry.id} className="rounded-md border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      {entry.author} · {when(entry.createdAt)}
                    </p>
                    {entry.text.includes("<") ? (
                      <div
                        className={`mt-2 ${WORK_ITEM_HTML_CLASS}`}
                        dangerouslySetInnerHTML={{ __html: workItemHtml(entry.text) }}
                      />
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm">{entry.text}</p>
                    )}
                  </article>
                ))
              )}
            </section>
            {(item.fields ?? []).length > 0 ? (
              <section>
                <h3 className="mb-3 text-sm font-medium">Campos</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {(item.fields ?? []).map((entry) => (
                    <Fact key={entry.label} label={entry.label}>
                      {entry.value}
                    </Fact>
                  ))}
                </div>
              </section>
            ) : null}
            {(item.relations ?? []).length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-medium">Relacionado</h3>
                <ul className="space-y-1 text-sm">
                  {(item.relations ?? []).map((relation, index) => (
                    <li key={`${relation.url}-${index}`} className="flex min-w-0 gap-2">
                      <span className="shrink-0 text-muted-foreground">{relation.name}</span>
                      {relation.id ? (
                        <span className="truncate">
                          #{relation.id} {relation.title ?? ""}
                        </span>
                      ) : (
                        <span className="truncate">{relation.url}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
      <footer className="flex shrink-0 items-center gap-3 border-t px-4 py-3">
        {notice ? (
          <p className={`text-xs ${notice.tone === "error" ? "text-destructive" : "text-primary"}`}>
            {notice.text}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {threadId
              ? "Quitar desvincula el hilo. La tarea sigue en Azure."
              : "Los cambios se publican en Azure DevOps."}
          </p>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          <SaveIcon /> Guardar
        </Button>
      </footer>
    </div>
  );
}
