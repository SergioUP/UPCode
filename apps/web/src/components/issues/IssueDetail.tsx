import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";
import { ExternalLinkIcon, TagIcon, XIcon } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";

import { Button } from "../ui/button";
import { DialogContent, DialogFooter, DialogHeader, DialogPanel, DialogTitle } from "../ui/dialog";
import { WORK_ITEM_HTML_CLASS, workItemHtml } from "../chat/workItemHtml";
import { AssigneeAvatar, LabelChip, StatePill } from "./IssueCard";
import { iterationName, stateHex, type IssueSprint } from "./issueVisuals";

type Notice = { tone: "ok" | "error"; text: string };

/** Exactly the fields the detail panel may publish; each one is optional. */
export type IssueDetailChanges = {
  title?: string;
  description?: string;
  state?: string;
  assignedTo?: string | null;
  iterationPath?: string;
  comment?: string;
};

/**
 * The task opens in the middle of the screen, the way a board card does in Jira:
 * the board keeps its width underneath and nothing is edited until Guardar.
 */
export function IssueDetail({
  item,
  states,
  iterations,
  people,
  labels,
  knownLabels,
  projectRoot,
  saving,
  notice,
  onClose,
  onSave,
  onSaveLabels,
}: {
  readonly item: AzureDevOpsWorkItem;
  readonly states: readonly AzureDevOpsWorkItemStateOption[];
  readonly iterations: readonly IssueSprint[];
  readonly people: readonly string[];
  readonly labels: readonly string[];
  readonly knownLabels: readonly string[];
  readonly projectRoot: string;
  readonly saving: boolean;
  readonly notice: Notice | null;
  readonly onClose: () => void;
  readonly onSave: (changes: IssueDetailChanges) => Promise<void>;
  readonly onSaveLabels: (labels: string[]) => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [state, setState] = useState(item.state);
  const [assignedTo, setAssignedTo] = useState(item.assignedTo ?? "");
  const [iterationPath, setIterationPath] = useState(item.iteration ?? projectRoot);
  const [editingDescription, setEditingDescription] = useState(false);
  const [comment, setComment] = useState("");
  const [labelDraft, setLabelDraft] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  const dirty =
    title.trim() !== item.title ||
    state !== item.state ||
    assignedTo !== (item.assignedTo ?? "") ||
    iterationPath !== (item.iteration ?? projectRoot) ||
    editingDescription ||
    comment.trim().length > 0;

  const description = item.description ?? "";
  const draftColor = stateHex(
    states.find((entry) => entry.name === state)?.color ??
      states.find((entry) => entry.name === item.state)?.color,
  );

  const save = async () => {
    const changes: IssueDetailChanges = {};
    if (title.trim() && title.trim() !== item.title) changes.title = title.trim();
    if (comment.trim()) changes.comment = comment.trim();
    if (state !== item.state) changes.state = state;
    if (assignedTo !== (item.assignedTo ?? "")) changes.assignedTo = assignedTo || null;
    if (iterationPath !== (item.iteration ?? projectRoot)) changes.iterationPath = iterationPath;
    if (editingDescription && editorRef.current) {
      const next = editorRef.current.innerHTML;
      if (next !== description) changes.description = next;
    }
    if (Object.keys(changes).length === 0) return;
    await onSave(changes);
    setEditingDescription(false);
    setComment("");
  };

  const addLabel = async (value: string) => {
    const label = value.trim();
    if (!label || labels.includes(label)) return;
    setLabelDraft("");
    await onSaveLabels([...labels, label]);
  };

  return (
    <DialogContent
      className="w-full max-w-3xl"
      style={{ borderTop: `3px solid ${draftColor}` } as CSSProperties}
    >
      <DialogHeader>
        <span className="flex items-center gap-2">
          <StatePill state={item.state} color={draftColor} />
          <span className="text-xs text-muted-foreground">{item.type}</span>
          <span className="font-mono text-2xs text-muted-foreground">#{item.id}</span>
          <span className="ml-auto flex items-center gap-3 pr-8">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
            >
              Abrir en Azure
              <ExternalLinkIcon className="size-3" />
            </a>
          </span>
        </span>
        <DialogTitle>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Título"
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold outline-none hover:border-border focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          />
        </DialogTitle>
      </DialogHeader>

      <DialogPanel className="max-h-[62vh]" scrollFade>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">Estado</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: draftColor }}
                aria-hidden
              />
              <select
                value={state}
                onChange={(event) => setState(event.target.value)}
                className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {states.map((option) => (
                  <option key={option.name} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">Persona</span>
            <span className="inline-flex items-center gap-1.5">
              <AssigneeAvatar name={assignedTo || null} />
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <option value="">Sin asignar</option>
                {people.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">
              Sprint (iteración)
            </span>
            <select
              value={iterationPath}
              onChange={(event) => setIterationPath(event.target.value)}
              className="rounded border bg-background px-1.5 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <option value={projectRoot}>Sin sprint</option>
              {iterations.map((iteration) => (
                <option key={iteration.path} value={iteration.path}>
                  {iteration.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">
              Área (solo lectura)
            </span>
            <span className="truncate text-xs">{item.area ?? "Sin área"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">
              Sprint actual
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {iterationName(iterationPath) ?? "sin sprint"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1 text-3xs uppercase tracking-wide text-muted-foreground">
            <TagIcon className="size-3" />
            Etiquetas locales (no van a Azure)
          </span>
          <span className="flex flex-wrap gap-1">
            {labels.length === 0 ? (
              <span className="text-2xs text-muted-foreground">Ninguna</span>
            ) : (
              labels.map((label) => (
                <span key={label} className="inline-flex items-center gap-0.5">
                  <LabelChip label={label} />
                  <button
                    type="button"
                    aria-label={`Quitar ${label}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void onSaveLabels(labels.filter((entry) => entry !== label))}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))
            )}
          </span>
          <form
            className="flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void addLabel(labelDraft);
            }}
          >
            <input
              list={`labels-${item.id}`}
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              placeholder="Añadir etiqueta y Enter"
              className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            />
            <datalist id={`labels-${item.id}`}>
              {knownLabels
                .filter((label) => !labels.includes(label))
                .map((label) => (
                  <option key={label} value={label} />
                ))}
            </datalist>
            <Button type="submit" variant="outline" size="sm" disabled={!labelDraft.trim()}>
              Añadir
            </Button>
          </form>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2 text-3xs uppercase tracking-wide text-muted-foreground">
            Descripción
            <button
              type="button"
              className="ml-auto text-3xs normal-case text-primary hover:underline"
              onClick={() => setEditingDescription((current) => !current)}
            >
              {editingDescription ? "Cancelar edición" : "Editar"}
            </button>
          </span>
          {description.length === 0 && !editingDescription ? (
            <p className="text-xs text-muted-foreground">Sin descripción.</p>
          ) : null}
          {editingDescription ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className={`${WORK_ITEM_HTML_CLASS} min-h-28 rounded border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring`}
              dangerouslySetInnerHTML={{ __html: workItemHtml(description) }}
            />
          ) : description.length > 0 ? (
            <div
              className={`${WORK_ITEM_HTML_CLASS} text-xs`}
              dangerouslySetInnerHTML={{ __html: workItemHtml(description) }}
            />
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">
              Añadir comentario
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              placeholder="Se publica en Azure al guardar"
              className="resize-none rounded border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">
              Últimos comentarios
            </span>
            <div className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
              {(item.comments ?? []).length === 0 ? (
                <span className="text-2xs text-muted-foreground">Sin comentarios.</span>
              ) : (
                (item.comments ?? []).map((entry) => (
                  <div key={entry.id} className="rounded border p-2">
                    <span className="text-3xs text-muted-foreground">{entry.author}</span>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs">{entry.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogPanel>

      <DialogFooter>
        <span
          className={`mr-auto min-w-0 flex-1 text-2xs ${
            notice?.tone === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {notice?.text ??
            (dirty
              ? "Hay cambios sin guardar."
              : "Sin cambios pendientes. Todo lo que ves es de Azure.")}
        </span>
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
        <Button disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar en Azure"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
