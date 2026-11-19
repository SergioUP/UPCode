const DAY = 86_400_000;

/** Use calendar day numbers so sprint bars do not shift at DST boundaries. */
export function calendarDay(value: string | null | undefined): number | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date.getTime() / DAY
    : null;
}

export const calendarDate = (day: number) => new Date(day * DAY);

export function monthWeeks(year: number, month: number): number[] {
  const first = Date.UTC(year, month, 1) / DAY;
  const last = Date.UTC(year, month + 1, 0) / DAY;
  const monday = first - ((calendarDate(first).getUTCDay() + 6) % 7);
  return Array.from(
    { length: Math.ceil((last - monday + 1) / 7) },
    (_, index) => monday + index * 7,
  );
}

export type CalendarSpan<T> = { item: T; start: number; finish: number };

/** Clip inclusive ranges to a week and pack overlapping tasks into separate rows. */
export function weekSegments<T>(spans: readonly CalendarSpan<T>[], week: number) {
  const occupied: number[] = [];
  return spans
    .filter((span) => span.start <= week + 6 && span.finish >= week)
    .toSorted((a, b) => a.start - b.start || b.finish - a.finish)
    .map((span) => {
      const start = Math.max(week, span.start) - week;
      const finish = Math.min(week + 6, span.finish) - week;
      let row = occupied.findIndex((end) => end < start);
      if (row === -1) row = occupied.length;
      occupied[row] = finish;
      return {
        ...span,
        column: start + 1,
        width: finish - start + 1,
        row: row + 1,
        continuesBefore: span.start < week,
        continuesAfter: span.finish > week + 6,
      };
    });
}
