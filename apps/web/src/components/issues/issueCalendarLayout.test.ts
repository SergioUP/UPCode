import { describe, expect, it } from "vite-plus/test";
import { calendarDate, calendarDay, monthWeeks, weekSegments } from "./issueCalendarLayout";

describe("calendar dates", () => {
  it("keeps Azure dates stable across time zones and daylight saving", () => {
    expect(calendarDay("2026-03-29T00:00:00Z")).toBe(calendarDay("2026-03-29"));
    expect(calendarDay("2026-03-30")! - calendarDay("2026-03-29")!).toBe(1);
    expect(calendarDay("2026-02-30")).toBeNull();
    expect(calendarDay(null)).toBeNull();
  });
  it("covers a six-week month and a leap February, starting on Monday", () => {
    const weeks = monthWeeks(2026, 2);
    expect(weeks).toHaveLength(6);
    expect(calendarDate(weeks[0]!).toISOString().slice(0, 10)).toBe("2026-02-23");
    expect(
      calendarDate(weeks.at(-1)! + 6)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-04-05");
    const leap = monthWeeks(2028, 1);
    expect(leap.at(-1)! + 6).toBeGreaterThanOrEqual(calendarDay("2028-02-29")!);
  });
});

describe("sprint bars", () => {
  it("continues a task across weeks and includes the final day", () => {
    const spans = [{ item: "task", start: 2, finish: 8 }];
    expect(weekSegments(spans, 0)[0]).toMatchObject({
      column: 3,
      width: 5,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(weekSegments(spans, 7)[0]).toMatchObject({
      column: 1,
      width: 2,
      continuesBefore: true,
      continuesAfter: false,
    });
    expect(weekSegments(spans, 14)).toEqual([]);
  });
  it("separates overlaps and reuses rows for non-overlapping tasks", () => {
    const segments = weekSegments(
      [
        { item: "first", start: 0, finish: 2 },
        { item: "overlap", start: 2, finish: 4 },
        { item: "next", start: 3, finish: 6 },
      ],
      0,
    );
    expect(segments.map(({ item, row }) => [item, row])).toEqual([
      ["first", 1],
      ["overlap", 2],
      ["next", 1],
    ]);
  });
});
