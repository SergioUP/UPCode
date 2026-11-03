"use client";

import type { EnvironmentId, Subagent } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { SubagentAvatar } from "../subagents/SubagentAvatar";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

/**
 * The thread's view of the global subagents.
 *
 * Clicking a role writes the opening of the request into the thread's composer,
 * because the delegated run has to start from the conversation: this panel can
 * describe a role, but it cannot open a child thread on its own. Before, the
 * click only wrote to the clipboard and said nothing, so it looked like a dud
 * button.
 */
export function ThreadSubagentsControl({
  environmentId,
  onInsertComposerText,
}: {
  readonly environmentId: EnvironmentId;
  /** Returns false when there is no composer to write into. */
  readonly onInsertComposerText?: ((text: string) => boolean) | undefined;
}) {
  const navigate = useNavigate();
  const subagents = useEnvironmentSettings(environmentId, (settings) => settings.subagents);
  const sorted = [...subagents].sort((left, right) => left.name.localeCompare(right.name));

  const askForRole = (subagent: Subagent) => {
    const instruction = `Usa el subagente "${subagent.name}" para: `;

    if (onInsertComposerText?.(instruction) === true) {
      toastManager.add({
        type: "info",
        title: subagent.name,
        description: "El encargo está en el mensaje: escribe la tarea y envíalo.",
      });
      return;
    }

    // No composer (another thread is open, or the panel is showing a draft):
    // leave the text on the clipboard rather than doing nothing at all.
    void navigator.clipboard.writeText(instruction).then(
      () => {
        toastManager.add({
          type: "info",
          title: subagent.name,
          description: "Copiado: pégalo en el mensaje con Ctrl+V.",
        });
      },
      () => {
        toastManager.add({
          type: "error",
          title: "No se pudo copiar el encargo",
          description: "El portapapeles no está disponible.",
        });
      },
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
        <span className="text-2xs text-muted-foreground">
          {sorted.length === 0
            ? "Sin subagentes"
            : `${sorted.length} global${sorted.length === 1 ? "" : "es"}`}
        </span>
        <Button
          variant="ghost"
          size="icon-micro"
          aria-label="Gestionar subagentes"
          onClick={() => void navigate({ to: "/agents" })}
        >
          <PlusIcon />
        </Button>
      </div>

      {sorted.length === 0 ? (
        <button
          type="button"
          className="mx-1.5 rounded-md border border-dashed border-border/70 px-2 py-1.5 text-left text-2xs text-muted-foreground hover:bg-accent/40"
          onClick={() => void navigate({ to: "/agents" })}
        >
          Crea un rol con sus instrucciones y estará disponible en todos los proyectos.
        </button>
      ) : (
        sorted.map((subagent) => {
          return (
            <button
              key={subagent.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/50"
              onClick={() => askForRole(subagent)}
            >
              <SubagentAvatar
                avatar={subagent.avatar}
                icon={subagent.icon}
                hue={subagent.hue}
                name={subagent.name}
                size="sm"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium">{subagent.name}</span>
                <span className="truncate text-3xs text-muted-foreground">
                  {subagent.prompt.trim().length === 0
                    ? "Sin instrucciones"
                    : subagent.prompt.trim().slice(0, 64)}
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
