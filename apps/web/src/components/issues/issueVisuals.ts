import type { AzureDevOpsWorkItem } from "@t3tools/contracts";

/**
 * The Issues section exists for one thing in UPANGO's process: the `Sub Tarea`
 * items the whole team actually works on. Everything else in the project's type
 * catalogue (Bug, Epic, Contenedor…) is deliberately out of scope.
 */
export const ISSUE_WORK_ITEM_TYPE = "Sub Tarea";

/** ADO states carry a bare hex colour without the leading `#`. */
export const stateHex = (color: string | undefined): string =>
  color && color.length > 0 ? `#${color.replace("#", "")}` : "#8b8b8b";

const channels = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return [139, 139, 139];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/**
 * Ink that stays legible on a solid colour, wherever the theme puts the surface.
 * ADO's palette runs from `#c9e7e7` to `#339933`, so a fixed white or black text
 * would fail on one end of it.
 */
export const inkOn = (hex: string): string => {
  const [red, green, blue] = channels(hex);
  return 0.299 * red + 0.587 * green + 0.114 * blue > 150 ? "#141414" : "#ffffff";
};

/** A wash of a colour over whatever the theme uses as a surface. */
export const stateTint = (hex: string, percent: number): string =>
  `color-mix(in srgb, ${hex} ${percent}%, var(--card))`;

/** The same colour as a translucent veil, for borders and column chrome. */
export const stateVeil = (hex: string, percent: number): string =>
  `color-mix(in srgb, ${hex} ${percent}%, transparent)`;

/**
 * Areas are hierarchical and long (`PROJECT\CLIENT\TEAM`), so their colour comes
 * from the leaf name: the same area keeps the same colour everywhere.
 */
const areaHue = (area: string | null | undefined): number => {
  const leaf = areaLeaf(area) ?? "";
  let hash = 0;
  for (const character of leaf) hash = (hash * 37 + character.codePointAt(0)!) % 360;
  return hash;
};

/** Solid enough to read as "colourful" against the state-tinted card. */
export const areaColor = (area: string | null | undefined): string =>
  `hsl(${areaHue(area)} 52% 44%)`;

/**
 * Areas are hierarchical and long (`PROJECT\CLIENT\TEAM`). The chip shows the
 * leaf, which is the part that identifies the work, and the full path goes in
 * the tooltip.
 */
export const areaLeaf = (area: string | null | undefined): string | null => {
  const leaf = area?.split("\\").findLast((segment) => segment.length > 0);
  return leaf ?? null;
};

/**
 * Labels are local, so their colour has to be derived from the name: the same
 * label keeps the same hue everywhere without storing a palette.
 */
const labelHue = (label: string): number => {
  let hash = 0;
  for (const character of label) {
    hash = (hash * 31 + character.codePointAt(0)!) % 360;
  }
  return hash;
};

export const labelTint = (label: string): string => `hsl(${labelHue(label)} 70% 50%)`;

/** Democratic short form for the card: `12.10-23.10-26` instead of the full path. */
export const iterationName = (path: string | null | undefined): string | null =>
  path?.split("\\").findLast((segment) => segment.length > 0) ?? null;

export const relativeTime = (value: string | null | undefined, now: number): string | null => {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  const hours = (now - time) / 3_600_000;
  if (hours < 1) return "hace minutos";
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} d`;
};

export const dayLabel = (value: string | null): string => {
  if (!value) return "sin fechas";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fechas";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
};

/**
 * A sprint as the views need it. UPCode builds this from the work items instead
 * of asking ADO for the iteration tree: each item carries its own sprint's dates,
 * so the calendar and the selector cost no extra request.
 */
export type IssueSprint = {
  readonly name: string;
  readonly path: string;
  readonly startDate: string | null;
  readonly finishDate: string | null;
};

export const sprintsFromItems = (items: readonly AzureDevOpsWorkItem[]): IssueSprint[] => {
  const byPath = new Map<string, IssueSprint>();
  for (const item of items) {
    const path = item.iteration;
    if (!path || byPath.has(path)) continue;
    byPath.set(path, {
      name: iterationName(path) ?? path,
      path,
      startDate: item.iterationStart ?? null,
      finishDate: item.iterationFinish ?? null,
    });
  }
  return [...byPath.values()].sort((left, right) => {
    if (!left.startDate) return 1;
    if (!right.startDate) return -1;
    return Date.parse(left.startDate) - Date.parse(right.startDate);
  });
};

/**
 * A sprint is current when today falls inside its dates. ADO only answers that
 * for a team's iterations, and this project assigns sprints to several teams, so
 * the client decides from the dates it already has.
 */
export const isCurrentIteration = (iteration: IssueSprint, now: number): boolean => {
  if (!iteration.startDate || !iteration.finishDate) return false;
  const start = Date.parse(iteration.startDate);
  const finish = Date.parse(iteration.finishDate);
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return false;
  return now >= start && now <= finish + 86_400_000;
};

/** Board columns read left to right by the project's own state order. */
export const groupByState = (
  items: readonly AzureDevOpsWorkItem[],
  states: readonly string[],
): Array<{ state: string; items: AzureDevOpsWorkItem[] }> => {
  const buckets = new Map<string, AzureDevOpsWorkItem[]>(states.map((state) => [state, []]));
  for (const item of items) {
    const bucket = buckets.get(item.state);
    if (bucket) bucket.push(item);
    // A state the type no longer defines still deserves a column, at the end.
    else buckets.set(item.state, [item]);
  }
  return [...buckets].map(([state, bucketItems]) => ({ state, items: bucketItems }));
};

/** `25` → `25:00`, `6.45` → `06:27`. Azure reports `Microsoft.VSTS.Scheduling.*` as hours. */
export const hoursLabel = (hours: number | null | undefined): string => {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const totalMinutes = Math.round(hours * 60);
  const whole = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(whole).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/** A sprint date cell, `12/10/2026`, or a dash when the sprint has no dates. */
export const taskDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

/**
 * The months a sprint touches, as `YYYY-MM` keys, oldest first. A sprint that runs from one
 * month into the next belongs to both: the work happens in both, and a month filter that hid it
 * would look like missing work. A sprint without dates belongs to none, so it only shows in the
 * unfiltered view.
 */
export const sprintMonths = (
  startDate: string | null | undefined,
  finishDate: string | null | undefined,
): string[] => {
  const keys = new Set(
    [startDate, finishDate].flatMap((value) =>
      value && /^\d{4}-\d{2}/.test(value) ? [value.slice(0, 7)] : [],
    ),
  );
  const [first] = [...keys].sort();
  if (!first) return [];
  const last = [...keys].sort().at(-1) ?? first;
  // Month arithmetic on integers, so a sprint that spans a new year needs no Date object.
  const [startYear, startMonth] = first.split("-").map(Number) as [number, number];
  const [endYear, endMonth] = last.split("-").map(Number) as [number, number];
  const months: string[] = [];
  for (
    let index = startYear * 12 + (startMonth - 1);
    index <= endYear * 12 + (endMonth - 1);
    index += 1
  ) {
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return months;
};

/** `2026-10` → `octubre 2026`, capitalised the way a filter reads. */
export const monthLabel = (key: string): string => {
  const date = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  const label = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * The tasks view groups by sprint, oldest first: the work that should have happened first is
 * read first. The dates travel with the work item, so grouping costs no extra call, and items
 * with no sprint fall to the end instead of pretending to be the oldest.
 */
export const groupBySprint = (
  items: readonly AzureDevOpsWorkItem[],
): Array<{ sprint: IssueSprint | null; items: AzureDevOpsWorkItem[] }> => {
  const groups = new Map<string, { sprint: IssueSprint | null; items: AzureDevOpsWorkItem[] }>();
  for (const item of items) {
    const key = item.iteration ?? "";
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      continue;
    }
    groups.set(key, {
      sprint: item.iteration
        ? {
            name: iterationName(item.iteration) ?? item.iteration,
            path: item.iteration,
            startDate: item.iterationStart ?? null,
            finishDate: item.iterationFinish ?? null,
          }
        : null,
      items: [item],
    });
  }
  return [...groups.values()].sort((left, right) => {
    if (!left.sprint) return 1;
    if (!right.sprint) return -1;
    if (!left.sprint.startDate) return 1;
    if (!right.sprint.startDate) return -1;
    return Date.parse(left.sprint.startDate) - Date.parse(right.sprint.startDate);
  });
};
