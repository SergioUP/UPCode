import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";

import { AreaChip, AssigneeAvatar, LabelChip, StatePill } from "./IssueCard";
import { iterationName, relativeTime, stateHex } from "./issueVisuals";

const COLUMNS = ["#", "Tarea", "Área", "Estado", "Persona", "Sprint", "Etiquetas", "Cambiada"];

/**
 * The list is the views' workhorse: one row per `Sub Tarea`, same facts as the
 * board card, in the order you scan them. Each row keeps the state's colour as a
 * rail on its left edge, so the eye can group the flow while scrolling.
 */
export function IssueList({
  items,
  states,
  labelsFor,
  now,
  onOpen,
}: {
  readonly items: readonly AzureDevOpsWorkItem[];
  readonly states: readonly AzureDevOpsWorkItemStateOption[];
  readonly labelsFor: (item: AzureDevOpsWorkItem) => readonly string[];
  readonly now: number;
  readonly onOpen: (item: AzureDevOpsWorkItem) => void;
}) {
  const colorOf = (state: string) => states.find((entry) => entry.name === state)?.color;

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const labels = labelsFor(item);
            const changed = relativeTime(item.changedAt, now);
            const color = colorOf(item.state);
            return (
              <tr
                key={item.id}
                className="cursor-pointer border-b last:border-b-0 hover:bg-accent/60"
                onClick={() => onOpen(item)}
              >
                <td
                  className="px-3 py-1.5 align-top font-mono text-[11px] font-semibold"
                  style={{
                    borderLeft: `3px solid ${stateHex(color)}`,
                    color: stateHex(color),
                  }}
                >
                  {item.id}
                </td>
                <td className="max-w-[420px] px-3 py-1.5 align-top">
                  <span className="line-clamp-2">{item.title}</span>
                </td>
                <td className="max-w-[180px] px-3 py-1.5 align-top">
                  <AreaChip area={item.area} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 align-top">
                  <StatePill state={item.state} color={color} />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 align-top">
                  <span className="inline-flex items-center gap-1.5">
                    <AssigneeAvatar name={item.assignedTo} />
                    <span className="max-w-[130px] truncate text-muted-foreground">
                      {item.assignedTo ?? "Sin asignar"}
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 align-top text-muted-foreground">
                  {iterationName(item.iteration) ?? "—"}
                </td>
                <td className="px-3 py-1.5 align-top">
                  <span className="flex flex-wrap gap-1">
                    {labels.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      labels.map((label) => <LabelChip key={label} label={label} />)
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 align-top text-muted-foreground">
                  {changed ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nada que mostrar con estos filtros.</p>
      ) : null}
    </div>
  );
}
