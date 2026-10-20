import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";
import { useMemo } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  areaLeaf,
  groupBySprint,
  hoursLabel,
  inkOn,
  relativeTime,
  stateHex,
  stateVeil,
  taskDate,
} from "./issueVisuals";

const totalHours = (values: ReadonlyArray<number | null | undefined>): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Every project at once, in sprint order, one card per task: the first group is the oldest
 * sprint because that is the work that should have happened first. Each card carries the two
 * things a status sheet needs at a glance — where the task lives and what it costs — plus the
 * person, the priority and when it last moved.
 */
export function IssueTasks({
  items,
  states,
  onOpen,
  now,
}: {
  readonly items: readonly AzureDevOpsWorkItem[];
  readonly states: readonly AzureDevOpsWorkItemStateOption[];
  readonly onOpen: (item: AzureDevOpsWorkItem) => void;
  readonly now: number;
}) {
  const colorByState = useMemo(
    () => new Map(states.map((state) => [state.name, state.color])),
    [states],
  );
  const groups = useMemo(() => groupBySprint(items), [items]);

  if (items.length === 0) {
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        Sin tareas en ningún proyecto con estos filtros.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.sprint?.path ?? "sin-sprint"} className="flex flex-col gap-1.5">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 text-3xs">
              <h2 className="font-semibold uppercase tracking-wide">
                {group.sprint?.name ?? "Sin sprint"}
              </h2>
              {group.sprint ? (
                <span className="text-muted-foreground">
                  {taskDate(group.sprint.startDate)} → {taskDate(group.sprint.finishDate)}
                </span>
              ) : null}
              <span className="text-muted-foreground">{group.items.length} tareas</span>
              <span className="ml-auto flex gap-3 font-mono tabular-nums text-muted-foreground">
                <span>
                  Plan. {hoursLabel(totalHours(group.items.map((item) => item.originalEstimate)))}
                </span>
                <span>
                  Dedicadas {hoursLabel(totalHours(group.items.map((item) => item.completedWork)))}
                </span>
                <span>
                  Pend. {hoursLabel(totalHours(group.items.map((item) => item.remainingWork)))}
                </span>
              </span>
            </header>

            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => {
                const hex = stateHex(colorByState.get(item.state));
                const area = areaLeaf(item.area);
                const changed = relativeTime(item.changedAt, now);
                return (
                  <li key={`${item.project}#${item.id}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      className="group flex w-full items-start gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      style={{ borderLeft: `3px solid ${hex}` }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span
                            className="shrink-0 rounded px-1.5 py-px text-3xs font-semibold"
                            style={{ backgroundColor: stateVeil(hex, 22), color: hex }}
                          >
                            {item.state}
                          </span>
                          <span
                            className="shrink-0 rounded px-1 py-px font-mono text-3xs font-semibold"
                            style={{ backgroundColor: hex, color: inkOn(hex) }}
                          >
                            #{item.id}
                          </span>
                          <span className="min-w-0 text-sm font-medium leading-snug">
                            {item.title}
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                          <span className="max-w-[18rem] truncate">
                            {item.parentTitle ?? "sin tarea padre"}
                          </span>
                          {area ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="max-w-[16rem] truncate">{area}</span>
                            </>
                          ) : null}
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">
                            {taskDate(item.iterationStart)} → {taskDate(item.iterationFinish)}
                          </span>
                          {item.assignedTo ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary">
                                  {initials(item.assignedTo)}
                                </span>
                                <span className="max-w-[12rem] truncate">{item.assignedTo}</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <span aria-hidden>·</span>
                              <span>sin asignar</span>
                            </>
                          )}
                          {item.priority ? (
                            <>
                              <span aria-hidden>·</span>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="rounded bg-muted px-1 py-px text-3xs font-medium" />
                                  }
                                >
                                  P{item.priority}
                                </TooltipTrigger>
                                <TooltipPopup side="top">Prioridad {item.priority}</TooltipPopup>
                              </Tooltip>
                            </>
                          ) : null}
                          {changed ? (
                            <>
                              <span aria-hidden>·</span>
                              <span>actualizada {changed}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid shrink-0 grid-cols-3 gap-3 text-right">
                        {(
                          [
                            ["Plan.", item.originalEstimate],
                            ["Dedicadas", item.completedWork],
                            ["Pend.", item.remainingWork],
                          ] as const
                        ).map(([label, value]) => (
                          <span key={label} className="flex flex-col">
                            <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                              {label}
                            </span>
                            <span className="font-mono text-xs tabular-nums">
                              {hoursLabel(value)}
                            </span>
                          </span>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
