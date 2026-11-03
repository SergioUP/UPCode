"use client";

import type { EnvironmentId } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { resolveSubagentIcon, subagentColor } from "../subagents/subagentIcons";
import { Button } from "../ui/button";

/**
 * The thread's view of the global subagents.
 *
 * It lists the roles the user defined and hands the text to ask for one to the
 * clipboard, because the delegated run has to start from the conversation: this
 * panel can describe a role, but it cannot open a child thread on its own.
 */
export function ThreadSubagentsControl({
  environmentId,
}: {
  readonly environmentId: EnvironmentId;
}) {
  const navigate = useNavigate();
  const subagents = useEnvironmentSettings(environmentId, (settings) => settings.subagents);
  const sorted = [...subagents].sort((left, right) => left.name.localeCompare(right.name));

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
          const Icon = resolveSubagentIcon(subagent.icon);
          return (
            <button
              key={subagent.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent/50"
              onClick={() =>
                void navigator.clipboard
                  .writeText(`Usa el subagente "${subagent.name}" para: `)
                  .catch(() => undefined)
              }
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-md border"
                style={{
                  color: subagentColor(subagent.hue),
                  background: `color-mix(in srgb, ${subagentColor(subagent.hue)} 14%, transparent)`,
                  borderColor: `color-mix(in srgb, ${subagentColor(subagent.hue)} 35%, transparent)`,
                }}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
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
