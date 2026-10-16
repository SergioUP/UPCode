import type { AzureDevOpsWorkItem } from "@t3tools/contracts";
import { useMemo, type CSSProperties } from "react";

import {
  areaColor,
  areaLeaf,
  inkOn,
  iterationName,
  labelTint,
  relativeTime,
  stateHex,
  stateTint,
  stateVeil,
} from "./issueVisuals";

/**
 * ADO avatars live behind the PAT, so an `<img>` would 401. Initials keep the
 * identity readable without a server-side proxy and without a broken image.
 */
function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

export function AssigneeAvatar({
  name,
  size = "sm",
}: {
  readonly name: string | null | undefined;
  readonly size?: "sm" | "md";
}) {
  const hue = useMemo(() => {
    if (!name) return 220;
    let hash = 0;
    for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) % 360;
    return hash;
  }, [name]);
  const className = size === "md" ? "size-6 text-[10px]" : "size-4.5 text-[9px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
      style={
        name
          ? {
              backgroundColor: `hsl(${hue} 55% 50% / 0.22)`,
              // The theme token keeps the initials legible in the light themes too.
              color: "var(--foreground)",
            }
          : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }
      }
      title={name ?? "Sin asignar"}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function LabelChip({ label }: { readonly label: string }) {
  const tint = labelTint(label);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border px-1.5 py-px text-[10px] leading-4"
      style={{ borderColor: `color-mix(in srgb, ${tint} 45%, transparent)` }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tint }}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * The state carries the colour of the whole board, so it reads as a solid chip
 * with ink chosen from the chip's own brightness.
 */
export function StatePill({
  state,
  color,
}: {
  readonly state: string;
  readonly color?: string | undefined;
}) {
  const hex = stateHex(color);
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-px text-[10px] font-semibold leading-4"
      style={{ backgroundColor: hex, color: inkOn(hex) }}
    >
      {state}
    </span>
  );
}

/**
 * The area is the client/project the work belongs to, so it gets its own colour,
 * derived from the name: the board stays readable without inventing a palette.
 */
export function AreaChip({ area }: { readonly area: string | null | undefined }) {
  const leaf = areaLeaf(area);
  if (!leaf) return null;
  const hex = areaColor(area);
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-px text-[10px] font-medium uppercase leading-4 tracking-wide"
      style={{ backgroundColor: hex, color: inkOn(hex) }}
      title={area ?? undefined}
    >
      {leaf}
    </span>
  );
}

/**
 * The card is the atom of all three views: same information, same weight, and a
 * wash of its state's own colour. The board passes `showState` false because the
 * column already names the state.
 */
export function IssueCard({
  item,
  labels,
  stateColor,
  showState,
  showIteration,
  now,
  onOpen,
  onDragStart,
  onDragEnd,
  compact,
}: {
  readonly item: AzureDevOpsWorkItem;
  readonly labels: readonly string[];
  readonly stateColor?: string | undefined;
  readonly showState?: boolean;
  readonly showIteration?: boolean;
  readonly now: number;
  readonly onOpen: () => void;
  readonly onDragStart?: () => void;
  readonly onDragEnd?: () => void;
  readonly compact?: boolean;
}) {
  const changed = relativeTime(item.changedAt, now);
  const accent = stateHex(stateColor);
  return (
    <article
      draggable={onDragStart !== undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", String(item.id));
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      className={`group relative rounded-lg border transition-[box-shadow,border-color] hover:ring-2 hover:ring-[var(--issue-accent)] focus-within:ring-2 focus-within:ring-[var(--issue-accent)] ${
        compact ? "p-2" : "p-2.5"
      }`}
      style={
        {
          "--issue-accent": accent,
          backgroundColor: stateTint(accent, stateColor ? 16 : 0),
          borderColor: stateVeil(accent, 42),
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer text-left focus-visible:outline-none"
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-flex shrink-0 items-center rounded px-1 py-px font-mono text-[10px] font-semibold leading-4"
            style={{ backgroundColor: accent, color: inkOn(accent) }}
          >
            #{item.id}
          </span>
          {showState ? <StatePill state={item.state} color={stateColor} /> : null}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {compact ? <AssigneeAvatar name={item.assignedTo} /> : null}
            {!compact && changed ? (
              <span className="text-[10px] text-muted-foreground">{changed}</span>
            ) : null}
          </span>
        </span>
        <span
          className={`mt-1.5 block text-[13px] leading-snug font-medium ${
            compact ? "line-clamp-2" : "line-clamp-3"
          }`}
        >
          {item.title}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <AreaChip area={item.area} />
          {showIteration ? (
            <span className="truncate text-[10px] text-muted-foreground">
              {iterationName(item.iteration) ?? "sin sprint"}
            </span>
          ) : null}
        </span>
        {labels.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {labels.map((label) => (
              <LabelChip key={label} label={label} />
            ))}
          </span>
        ) : null}
      </button>
      {compact ? null : (
        <span className="mt-1.5 flex items-center gap-1.5">
          <AssigneeAvatar name={item.assignedTo} />
          <span className="truncate text-[10px] text-muted-foreground">
            {item.assignedTo ?? "Sin asignar"}
          </span>
        </span>
      )}
    </article>
  );
}
