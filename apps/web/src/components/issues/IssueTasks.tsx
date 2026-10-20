import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";
import { Fragment, useMemo } from "react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { areaLeaf, groupBySprint, hoursLabel, inkOn, stateHex, taskDate } from "./issueVisuals";

const totalHours = (values: ReadonlyArray<number | null | undefined>): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

/**
 * Every project at once, in sprint order: the first group is the oldest sprint, because that is
 * the work that should have happened first. Each row says what the sub-task belongs to, where it
 * lives, when its sprint runs and what it costs, so the list reads like the team's own sheet.
 */
export function IssueTasks({
  items,
  states,
  onOpen,
}: {
  readonly items: readonly AzureDevOpsWorkItem[];
  readonly states: readonly AzureDevOpsWorkItemStateOption[];
  readonly onOpen: (item: AzureDevOpsWorkItem) => void;
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
    <div className="min-h-0 flex-1 overflow-auto rounded-md border">
      <table className="w-full border-collapse text-sm" aria-label="Tareas por sprint">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b text-3xs uppercase tracking-wide text-muted-foreground">
            <th className="w-6 p-2" aria-label="Estado" />
            <th className="p-2 text-left font-medium">Subtarea</th>
            <th className="w-40 p-2 text-left font-medium">Tarea</th>
            <th className="w-44 p-2 text-left font-medium">Proyecto</th>
            <th className="w-24 p-2 text-right font-medium">Inicio</th>
            <th className="w-24 p-2 text-right font-medium">Fin</th>
            <th className="w-20 p-2 text-right font-medium">H. Plan.</th>
            <th className="w-20 p-2 text-right font-medium">Dedicadas</th>
            <th className="w-20 p-2 text-right font-medium">H. Pen.</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.sprint?.path ?? "sin-sprint"}>
              <tr className="border-b bg-muted/60">
                <td colSpan={9} className="px-2 py-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-3xs">
                    <span className="font-semibold uppercase tracking-wide">
                      {group.sprint?.name ?? "Sin sprint"}
                    </span>
                    {group.sprint ? (
                      <span className="text-muted-foreground">
                        {taskDate(group.sprint.startDate)} → {taskDate(group.sprint.finishDate)}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">{group.items.length} tareas</span>
                    <span className="ml-auto flex gap-3 font-mono tabular-nums text-muted-foreground">
                      <span>
                        Plan.{" "}
                        {hoursLabel(totalHours(group.items.map((item) => item.originalEstimate)))}
                      </span>
                      <span>
                        Dedicadas{" "}
                        {hoursLabel(totalHours(group.items.map((item) => item.completedWork)))}
                      </span>
                      <span>
                        Pend.{" "}
                        {hoursLabel(totalHours(group.items.map((item) => item.remainingWork)))}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
              {group.items.map((item) => {
                const hex = stateHex(colorByState.get(item.state));
                return (
                  <tr
                    key={`${item.project}#${item.id}`}
                    onClick={() => onOpen(item)}
                    className="cursor-pointer border-b border-border/60 align-top last:border-b-0 hover:bg-accent/40"
                  >
                    <td className="py-1.5 pl-2 pr-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className="block size-2.5 rounded-full"
                              style={{ backgroundColor: hex }}
                            />
                          }
                        />
                        <TooltipPopup side="top">{item.state}</TooltipPopup>
                      </Tooltip>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-start gap-1.5">
                        <span
                          className="mt-px shrink-0 rounded px-1 py-px font-mono text-3xs font-semibold"
                          style={{ backgroundColor: hex, color: inkOn(hex) }}
                        >
                          #{item.id}
                        </span>
                        <span className="min-w-0 text-xs leading-snug">{item.title}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-2xs text-muted-foreground">
                      {item.parentTitle ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-2xs">
                      {areaLeaf(item.area) ?? item.project ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs tabular-nums">
                      {taskDate(item.iterationStart)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-2xs tabular-nums">
                      {taskDate(item.iterationFinish)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-2xs tabular-nums">
                      {hoursLabel(item.originalEstimate)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-2xs tabular-nums">
                      {hoursLabel(item.completedWork)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-2xs tabular-nums">
                      {hoursLabel(item.remainingWork)}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
