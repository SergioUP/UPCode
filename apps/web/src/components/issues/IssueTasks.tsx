import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "~/lib/utils";
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

/** Plan, spent and pending side by side, aligned so cards can be compared down the list. */
function HoursBlock({ item }: { readonly item: AzureDevOpsWorkItem }) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-3 text-right">
      {(
        [
          ["Plan.", item.originalEstimate],
          ["Dedicadas", item.completedWork],
          ["Pend.", item.remainingWork],
        ] as const
      ).map(([label, value]) => (
        <span key={label} className="flex flex-col">
          <span className="text-3xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="font-mono text-xs tabular-nums">{hoursLabel(value)}</span>
        </span>
      ))}
    </div>
  );
}

function SprintGroup({
  sprint,
  items,
  colorByState,
  now,
  onOpen,
}: {
  readonly sprint: ReturnType<typeof groupBySprint>[number]["sprint"];
  readonly items: readonly AzureDevOpsWorkItem[];
  readonly colorByState: ReadonlyMap<string, string>;
  readonly now: number;
  readonly onOpen: (item: AzureDevOpsWorkItem) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 text-3xs">
        <h3 className="font-semibold uppercase tracking-wide">{sprint?.name ?? "Sin sprint"}</h3>
        {sprint ? (
          <span className="text-muted-foreground">
            {taskDate(sprint.startDate)} → {taskDate(sprint.finishDate)}
          </span>
        ) : null}
        <span className="text-muted-foreground">{items.length} tareas</span>
        <span className="ml-auto flex gap-3 font-mono tabular-nums text-muted-foreground">
          <span>Plan. {hoursLabel(totalHours(items.map((item) => item.originalEstimate)))}</span>
          <span>Dedicadas {hoursLabel(totalHours(items.map((item) => item.completedWork)))}</span>
          <span>Pend. {hoursLabel(totalHours(items.map((item) => item.remainingWork)))}</span>
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const hex = stateHex(colorByState.get(item.state));
          const changed = relativeTime(item.changedAt, now);
          return (
            <li key={`${item.project}#${item.id}`}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex w-full items-start gap-3 rounded-lg border border-border/70 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
                    <span className="min-w-0 text-sm font-medium leading-snug">{item.title}</span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted-foreground">
                    <span className="max-w-[20rem] truncate">
                      {item.parentTitle ?? "sin tarea padre"}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {taskDate(item.iterationStart)} → {taskDate(item.iterationFinish)}
                    </span>
                    <span aria-hidden>·</span>
                    {item.assignedTo ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary">
                          {initials(item.assignedTo)}
                        </span>
                        <span className="max-w-[12rem] truncate">{item.assignedTo}</span>
                      </span>
                    ) : (
                      <span>sin asignar</span>
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
                <HoursBlock item={item} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Every project at once, separated by project and grouped by sprint inside each one: the project
 * sections are alphabetical so they can be found without reading the whole page, and the sprints
 * run oldest first because that is the work that should have happened first. The project label is
 * the area leaf, which is what the team calls the project.
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const colorByState = useMemo(
    () => new Map(states.map((state) => [state.name, state.color])),
    [states],
  );
  const projects = useMemo(() => {
    const byProject = new Map<string, AzureDevOpsWorkItem[]>();
    for (const item of items) {
      const label = areaLeaf(item.area) ?? item.project;
      const bucket = byProject.get(label);
      if (bucket) bucket.push(item);
      else byProject.set(label, [item]);
    }
    return [...byProject.entries()].sort(([left], [right]) => left.localeCompare(right, "es"));
  }, [items]);

  if (items.length === 0) {
    return (
      <p className="rounded-md border p-4 text-sm text-muted-foreground">
        Sin tareas en ningún proyecto con estos filtros.
      </p>
    );
  }

  const toggle = (project: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4">
        {projects.map(([project, projectItems]) => {
          const isCollapsed = collapsed.has(project);
          return (
            <section key={project} className="flex flex-col gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(project)}
                className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
                <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                  Proyecto
                </span>
                <span className="min-w-0 truncate text-xs font-semibold">{project}</span>
                <span className="ml-auto flex shrink-0 gap-3 font-mono text-3xs tabular-nums text-muted-foreground">
                  <span>{projectItems.length} tareas</span>
                  <span>
                    Plan.{" "}
                    {hoursLabel(totalHours(projectItems.map((item) => item.originalEstimate)))}
                  </span>
                  <span>
                    Dedicadas{" "}
                    {hoursLabel(totalHours(projectItems.map((item) => item.completedWork)))}
                  </span>
                  <span>
                    Pend. {hoursLabel(totalHours(projectItems.map((item) => item.remainingWork)))}
                  </span>
                </span>
              </button>

              {isCollapsed ? null : (
                <div className="flex flex-col gap-4 border-l pl-3">
                  {groupBySprint(projectItems).map((group) => (
                    <SprintGroup
                      key={group.sprint?.path ?? "sin-sprint"}
                      sprint={group.sprint}
                      items={group.items}
                      colorByState={colorByState}
                      now={now}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
