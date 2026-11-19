import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@upcode/contracts";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  calendarDate,
  calendarDay,
  monthWeeks,
  weekSegments,
  type CalendarSpan,
} from "./issueCalendarLayout";
import { dayLabel, stateHex, stateVeil, type IssueSprint } from "./issueVisuals";

export function IssueCalendar({
  items,
  iterations,
  states,
  labelsFor,
  now,
  onOpen,
}: {
  readonly items: readonly AzureDevOpsWorkItem[];
  readonly iterations: readonly IssueSprint[];
  readonly states: readonly AzureDevOpsWorkItemStateOption[];
  readonly labelsFor: (item: AzureDevOpsWorkItem) => readonly string[];
  readonly now: number;
  readonly onOpen: (item: AzureDevOpsWorkItem) => void;
}) {
  const [month, setMonth] = useState(() => {
    const date = new Date(now);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const todayDate = new Date(now);
  const today =
    Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()) / 86_400_000;
  const { spans, undated } = useMemo(() => {
    const byPath = new Map(iterations.map((iteration) => [iteration.path, iteration]));
    const spans: CalendarSpan<AzureDevOpsWorkItem>[] = [];
    const undated: AzureDevOpsWorkItem[] = [];
    for (const item of items) {
      const sprint = item.iteration ? byPath.get(item.iteration) : undefined;
      const start = calendarDay(item.iterationStart ?? sprint?.startDate);
      const finish = calendarDay(item.iterationFinish ?? sprint?.finishDate);
      if (start === null || finish === null || finish < start) undated.push(item);
      else spans.push({ item, start, finish });
    }
    return { spans, undated };
  }, [items, iterations]);
  const weeks = monthWeeks(month.year, month.month);
  const move = (offset: number) => {
    const date = new Date(Date.UTC(month.year, month.month + offset, 1));
    setMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() });
  };
  const heading = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.year, month.month, 1)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold capitalize" aria-live="polite">
          {heading}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonth({ year: todayDate.getFullYear(), month: todayDate.getMonth() })}
        >
          Hoy
        </Button>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mes anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mes siguiente"
            onClick={() => move(1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </header>
      <p className="text-xs text-muted-foreground">
        Cada barra abarca las fechas del sprint, incluido el último día.
      </p>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <div className="min-w-[640px]">
          <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-background">
            {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-medium uppercase text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          {weeks.map((week) => {
            const segments = weekSegments(spans, week);
            return (
              <section
                key={week}
                aria-label={`Semana del ${dayLabel(calendarDate(week).toISOString())}`}
                className="relative isolate min-h-32 border-b last:border-b-0"
              >
                <div className="pointer-events-none absolute inset-0 -z-10 grid grid-cols-7">
                  {Array.from({ length: 7 }, (_, index) => {
                    const day = week + index;
                    return (
                      <div
                        key={day}
                        className={`border-r last:border-r-0 ${day === today ? "bg-primary/5" : index > 4 ? "bg-muted/25" : ""}`}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: 7 }, (_, index) => {
                    const day = week + index;
                    const date = calendarDate(day);
                    return (
                      <div key={day} className="flex justify-end p-1.5">
                        <time
                          dateTime={date.toISOString().slice(0, 10)}
                          aria-current={day === today ? "date" : undefined}
                          className={`flex size-7 items-center justify-center rounded-full text-sm ${day === today ? "bg-primary font-semibold text-primary-foreground" : date.getUTCMonth() !== month.month ? "text-muted-foreground/50" : "text-foreground"}`}
                        >
                          {date.getUTCDate()}
                        </time>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 auto-rows-[30px] gap-y-1 px-1 pb-3">
                  {segments.map((segment) => {
                    const { item } = segment;
                    const color = stateHex(
                      states.find((state) => state.name === item.state)?.color,
                    );
                    const label = `#${item.id} ${item.title} · ${item.state} · ${dayLabel(calendarDate(segment.start).toISOString())} – ${dayLabel(calendarDate(segment.finish).toISOString())}`;
                    return (
                      <Tooltip key={`${item.project}-${item.id}`}>
                        <TooltipTrigger
                          render={<button />}
                          type="button"
                          onClick={() => onOpen(item)}
                          aria-label={label}
                          className={`mx-0.5 flex min-w-0 items-center gap-1.5 border-l-2 px-2 text-left text-xs motion-safe:transition-[filter,transform] hover:brightness-110 motion-safe:active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ring ${segment.continuesBefore ? "rounded-l-none" : "rounded-l-md"} ${segment.continuesAfter ? "rounded-r-none" : "rounded-r-md"}`}
                          style={{
                            gridColumn: `${segment.column} / span ${segment.width}`,
                            gridRow: segment.row,
                            borderColor: color,
                            backgroundColor: stateVeil(color, 20),
                          }}
                        >
                          {segment.continuesBefore ? <span aria-hidden>‹</span> : null}
                          <span className="shrink-0 font-mono text-muted-foreground">
                            #{item.id}
                          </span>
                          <span className="truncate font-medium">{item.title}</span>
                          {segment.continuesAfter ? (
                            <span className="ml-auto" aria-hidden>
                              ›
                            </span>
                          ) : null}
                        </TooltipTrigger>
                        <TooltipPopup>
                          {label}
                          {labelsFor(item).length > 0 ? ` · ${labelsFor(item).join(", ")}` : ""}
                        </TooltipPopup>
                      </Tooltip>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        {undated.length > 0 ? (
          <section className="border-t p-3">
            <h3 className="mb-2 text-sm font-medium">Sin fechas de sprint · {undated.length}</h3>
            <div className="flex flex-wrap gap-2">
              {undated.map((item) => (
                <Button
                  key={`${item.project}-${item.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => onOpen(item)}
                >
                  #{item.id} {item.title}
                </Button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
