import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";
import { useState, type CSSProperties } from "react";

import { IssueCard } from "./IssueCard";
import { groupByState, inkOn, stateHex, stateTint, stateVeil } from "./issueVisuals";

/**
 * Columns are the type's own states, in the order ADO defines them, and each one
 * wears the colour the process gives it: border, header and count. Dropping a
 * card writes `System.State` straight away; there is no drag preview to confirm.
 */
export function IssueBoard({
  items,
  states,
  density,
  labelsFor,
  now,
  busyIds,
  onOpen,
  onMove,
}: {
  readonly items: readonly AzureDevOpsWorkItem[];
  readonly states: readonly AzureDevOpsWorkItemStateOption[];
  readonly density: "comoda" | "compacta";
  readonly labelsFor: (item: AzureDevOpsWorkItem) => readonly string[];
  readonly now: number;
  readonly busyIds: ReadonlySet<number>;
  readonly onOpen: (item: AzureDevOpsWorkItem) => void;
  readonly onMove: (item: AzureDevOpsWorkItem, state: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const columns = groupByState(
    items,
    states.map((state) => state.name),
  );
  const colors = new Map(states.map((state) => [state.name, state.color]));
  // Static classes, so Tailwind keeps them; comfort first, compact when the whole
  // board has to fit on a laptop screen.
  const columnWidth =
    density === "comoda"
      ? "min-w-[260px] max-w-[360px] grow basis-[280px]"
      : "min-w-[190px] max-w-[300px] grow basis-[200px]";

  return (
    <div className="flex h-full min-h-0 gap-2 overflow-x-auto pb-2">
      {columns.map((column) => {
        const color = stateHex(colors.get(column.state));
        const isTarget = dragOver === column.state;
        return (
          <section
            key={column.state}
            aria-label={column.state}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOver(column.state);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragOver((current) => (current === column.state ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              const id = Number(event.dataTransfer.getData("text/plain"));
              const item = items.find((entry) => entry.id === id);
              if (!item || item.state === column.state) return;
              onMove(item, column.state);
            }}
            className={`flex flex-col overflow-hidden rounded-xl border-2 transition-colors ${columnWidth}`}
            style={
              {
                borderColor: isTarget ? color : stateVeil(color, 45),
                backgroundColor: stateTint(color, isTarget ? 13 : 5),
                boxShadow: isTarget ? `0 0 0 3px ${stateVeil(color, 25)}` : undefined,
              } as CSSProperties
            }
          >
            <span className="h-1 w-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
            <header
              className="flex items-center gap-2 border-b px-3 py-2"
              style={{
                borderColor: stateVeil(color, 32),
                backgroundColor: stateVeil(color, 12),
              }}
            >
              <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">{column.state}</h2>
              <span
                className="shrink-0 rounded-full px-1.5 py-px font-mono text-[10px] font-semibold"
                style={{ backgroundColor: color, color: inkOn(color) }}
              >
                {column.items.length}
              </span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
              {column.items.map((item) => (
                <div
                  key={item.id}
                  className={busyIds.has(item.id) ? "opacity-50" : undefined}
                  aria-busy={busyIds.has(item.id)}
                >
                  <IssueCard
                    item={item}
                    labels={labelsFor(item)}
                    stateColor={colors.get(column.state)}
                    now={now}
                    compact={density === "compacta"}
                    onOpen={() => onOpen(item)}
                    onDragStart={() => setDragging(item.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOver(null);
                    }}
                  />
                </div>
              ))}
              {column.items.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  {dragging === null ? "Vacío" : "Suelta aquí"}
                </p>
              ) : null}
            </div>
          </section>
        );
      })}
      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          El tipo «Sub Tarea» no devuelve estados en este proyecto.
        </p>
      ) : null}
    </div>
  );
}
