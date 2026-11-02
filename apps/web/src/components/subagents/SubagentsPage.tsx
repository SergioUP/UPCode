"use client";

import type { EnvironmentId, Subagent } from "@t3tools/contracts";
import { SUBAGENT_NAME_MAX_LENGTH, SUBAGENT_PROMPT_MAX_LENGTH } from "@t3tools/contracts";
import { ArrowLeftIcon, CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  SUBAGENT_HUES,
  SUBAGENT_ICONS,
  nextSubagentLook,
  resolveSubagentIcon,
  subagentColor,
} from "./subagentIcons";

interface Draft {
  readonly id: string;
  name: string;
  prompt: string;
  icon: string;
  hue: number;
  tools: string;
}

function newId(): string {
  return `subagent-${Math.random().toString(36).slice(2, 10)}`;
}

function toDraft(subagent: Subagent | null): Draft {
  if (subagent === null) {
    return { id: newId(), name: "", prompt: "", icon: "bot", hue: 214, tools: "" };
  }
  return {
    id: subagent.id,
    name: subagent.name,
    prompt: subagent.prompt,
    icon: subagent.icon ?? "bot",
    hue: subagent.hue ?? 214,
    tools: (subagent.tools ?? []).join(", "),
  };
}

/**
 * Subagents: named roles the user writes once and every thread can delegate to.
 *
 * They are global — stored in the environment's settings, not in a project — so
 * the same reviewer is available in every repository. The editor is a dialog
 * rather than a page: a role is four fields, and leaving the list visible keeps
 * the effect of saving obvious.
 */
export function SubagentsPage({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const navigateToMainApp = useNavigateToMainApp();
  const subagents = useEnvironmentSettings(environmentId, (settings) => settings.subagents);
  const save = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => [...subagents].sort((left, right) => left.name.localeCompare(right.name)),
    [subagents],
  );

  const persist = async (next: ReadonlyArray<Subagent>) => {
    setBusy(true);
    setError(null);
    const result = await save({
      environmentId,
      input: { patch: { subagents: [...next] } },
    });
    setBusy(false);
    if (result._tag !== "Success") {
      setError("No se pudo guardar. Revisa la conexión con el servidor.");
      return false;
    }
    return true;
  };

  const commit = async () => {
    if (draft === null) return;
    const name = draft.name.trim();
    if (name.length === 0) {
      setError("El nombre es obligatorio.");
      return;
    }
    const now = Date.now();
    const existing = subagents.find((subagent) => subagent.id === draft.id);
    const entry: Subagent = {
      id: draft.id,
      name,
      prompt: draft.prompt,
      icon: draft.icon,
      hue: draft.hue,
      tools: draft.tools
        .split(",")
        .map((tool) => tool.trim())
        .filter((tool) => tool.length > 0),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next =
      existing === undefined
        ? [...subagents, entry]
        : subagents.map((subagent) => (subagent.id === entry.id ? entry : subagent));
    if (await persist(next)) setDraft(null);
  };

  const remove = async (subagent: Subagent) => {
    if (!window.confirm(`¿Borrar el subagente "${subagent.name}"?`)) return;
    await persist(subagents.filter((candidate) => candidate.id !== subagent.id));
  };

  return (
    <SidebarInset className="min-w-0">
      <WorkspacePageHeader>
        <Button variant="ghost" size="sm" onClick={navigateToMainApp}>
          <ArrowLeftIcon className="size-3.5" />
          Volver
        </Button>
        <h1 className="text-base font-semibold">Subagentes</h1>
        <span className="text-xs text-muted-foreground">
          {subagents.length === 0
            ? "roles globales, disponibles en cualquier proyecto"
            : `${subagents.length} rol${subagents.length === 1 ? "" : "es"} · globales para todos los proyectos`}
        </span>
        <div className="min-w-0 flex-1" />
        <Button
          size="sm"
          onClick={() => {
            const look = nextSubagentLook(subagents);
            setError(null);
            setDraft(toDraft(null));
            setDraft((current) => (current === null ? current : { ...current, ...look }));
          }}
        >
          <PlusIcon />
          Subagente
        </Button>
      </WorkspacePageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both p-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {error === null ? null : (
            <p className="rounded-lg border border-error/40 bg-error-surface px-3 py-2 text-xs text-error">
              {error}
            </p>
          )}

          {sorted.length === 0 ? (
            <div className="rounded-xl border border-border/60 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Todavía no hay subagentes.</p>
              <p className="mt-1 text-xs">
                Un subagente es un rol con instrucciones propias (tono, flujo de trabajo y reglas)
                al que el agente principal puede delegar trabajo. Créalo una vez y estará disponible
                en todos los proyectos.
              </p>
            </div>
          ) : (
            sorted.map((subagent) => {
              const Icon = resolveSubagentIcon(subagent.icon);
              return (
                <div
                  key={subagent.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60"
                    style={{
                      color: subagentColor(subagent.hue),
                      background: `color-mix(in srgb, ${subagentColor(subagent.hue)} 14%, transparent)`,
                      borderColor: `color-mix(in srgb, ${subagentColor(subagent.hue)} 35%, transparent)`,
                    }}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{subagent.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {subagent.prompt.trim().length === 0
                        ? "Sin instrucciones"
                        : subagent.prompt.trim().slice(0, 120)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1" />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${subagent.name}`}
                    onClick={() => {
                      setError(null);
                      setDraft(toDraft(subagent));
                    }}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Borrar ${subagent.name}`}
                    disabled={busy}
                    onClick={() => void remove(subagent)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
      >
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.name.trim().length ? draft.name : "Nuevo subagente"}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {draft === null ? null : (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex size-14 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      color: subagentColor(draft.hue),
                      background: `color-mix(in srgb, ${subagentColor(draft.hue)} 16%, transparent)`,
                      borderColor: `color-mix(in srgb, ${subagentColor(draft.hue)} 40%, transparent)`,
                    }}
                  >
                    {(() => {
                      const Icon = resolveSubagentIcon(draft.icon);
                      return <Icon className="size-6" aria-hidden />;
                    })()}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Nombre</span>
                    <Input
                      size="sm"
                      value={draft.name}
                      maxLength={SUBAGENT_NAME_MAX_LENGTH}
                      placeholder="Analizador de rendimiento"
                      aria-label="Nombre del subagente"
                      onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                    />
                    <span className="self-end text-3xs text-muted-foreground">
                      {draft.name.length}/{SUBAGENT_NAME_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Instrucciones</span>
                  <Textarea
                    value={draft.prompt}
                    maxLength={SUBAGENT_PROMPT_MAX_LENGTH}
                    rows={7}
                    placeholder="Rol, tono, flujo de trabajo y reglas. Por ejemplo: «Revisas cambios de C# buscando fugas de recursos; respondes con una lista de hallazgos ordenados por gravedad y nunca propones cambios sin un motivo»."
                    aria-label="Instrucciones del subagente"
                    onChange={(event) => setDraft({ ...draft, prompt: event.currentTarget.value })}
                  />
                  <span className="self-end text-3xs text-muted-foreground">
                    {draft.prompt.length}/{SUBAGENT_PROMPT_MAX_LENGTH}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Herramientas</span>
                  <Input
                    size="sm"
                    font="mono"
                    value={draft.tools}
                    placeholder="terminal, web-search, file-system"
                    aria-label="Herramientas del subagente"
                    onChange={(event) => setDraft({ ...draft, tools: event.currentTarget.value })}
                  />
                  <span className="text-3xs text-muted-foreground">
                    Separadas por comas. Se escriben en el encargo; el subagente decide con las que
                    tenga su proveedor.
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Icono</span>
                  <div className="flex flex-wrap gap-1">
                    {SUBAGENT_ICONS.map(({ name, Icon }) => {
                      const active = draft.icon === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-label={name}
                          aria-pressed={active}
                          onClick={() => setDraft({ ...draft, icon: name })}
                          className="flex size-8 items-center justify-center rounded-md border border-border/60 hover:bg-accent/60"
                          style={
                            active
                              ? {
                                  color: subagentColor(draft.hue),
                                  borderColor: subagentColor(draft.hue),
                                }
                              : undefined
                          }
                        >
                          <Icon className="size-4" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Color</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SUBAGENT_HUES.map((hue) => {
                      const active = draft.hue === hue;
                      return (
                        <button
                          key={hue}
                          type="button"
                          aria-label={`Color ${hue}`}
                          aria-pressed={active}
                          onClick={() => setDraft({ ...draft, hue })}
                          className="flex size-7 items-center justify-center rounded-full border border-border/60"
                          style={{ background: subagentColor(hue) }}
                        >
                          {active ? (
                            <CheckIcon className="size-3.5 text-black/80" aria-hidden />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void commit()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SidebarInset>
  );
}
