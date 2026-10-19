import type { AzureDevOpsWorkItem, AzureDevOpsWorkItemStateOption } from "@t3tools/contracts";
import { useMemo } from "react";

import { IssueCard } from "./IssueCard";
import { dayLabel, isCurrentIteration, iterationName, type IssueSprint } from "./issueVisuals";

const DAY = 86_400_000;

type SprintBucket = {
  readonly key: string;
  readonly name: string;
  readonly iteration: IssueSprint | null;
  readonly items: AzureDevOpsWorkItem[];
};

/**
 * The calendar is a sprint timeline, not a month grid. Nobody fills ADO's start
 * and due dates in this process, but every item has an iteration and every
 * iteration has real dates, so the sprint is the only honest time axis here.
 */
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
  const buckets = useMemo(() => {
    const byPath = new Map(iterations.map((iteration) => [iteration.path, iteration]));
    const grouped = new Map<string, SprintBucket>();
    for (const item of items) {
      const iteration = item.iteration ? (byPath.get(item.iteration) ?? null) : null;
      const key = iteration?.path ?? "";
      const bucket = grouped.get(key) ?? {
        key,
        name: iteration?.name ?? iterationName(item.iteration) ?? "Sin sprint",
        iteration,
        items: [],
      };
      bucket.items.push(item);
      grouped.set(key, bucket);
    }
    const withItems = [...grouped.values()];
    // A sprint with nothing in it is noise; the current one is worth showing empty.
    const extra: SprintBucket[] = iterations
      .filter(
        (iteration) =>
          isCurrentIteration(iteration, now) && !withItems.some((b) => b.key === iteration.path),
      )
      .map((iteration) => ({
        key: iteration.path,
        name: iteration.name,
        iteration,
        items: [],
      }));
    return [...withItems, ...extra].sort((left, right) => {
      if (left.key === "") return 1;
      if (right.key === "") return -1;
      const leftStart = left.iteration?.startDate ? Date.parse(left.iteration.startDate) : 0;
      const rightStart = right.iteration?.startDate ? Date.parse(right.iteration.startDate) : 0;
      return leftStart - rightStart;
    });
  }, [items, iterations, now]);

  const windowRange = useMemo(() => {
    const started = buckets
      .flatMap((bucket) =>
        bucket.iteration?.startDate ? [Date.parse(bucket.iteration.startDate)] : [],
      )
      .filter((value) => Number.isFinite(value));
    const finished = buckets
      .flatMap((bucket) =>
        bucket.iteration?.finishDate ? [Date.parse(bucket.iteration.finishDate)] : [],
      )
      .filter((value) => Number.isFinite(value));
    if (started.length === 0 || finished.length === 0) return null;
    const start = Math.min(...started);
    const finish = Math.max(...finished);
    return finish > start ? { start, finish } : null;
  }, [buckets]);

  /** The rail is a proportion of the whole window, so the marks carry real dates. */
  const rail = useMemo(() => {
    if (!windowRange) return [];
    const span = windowRange.finish - windowRange.start;
    return buckets.flatMap((bucket) => {
      const start = bucket.iteration?.startDate ? Date.parse(bucket.iteration.startDate) : NaN;
      const finish = bucket.iteration?.finishDate ? Date.parse(bucket.iteration.finishDate) : NaN;
      if (!Number.isFinite(start) || !Number.isFinite(finish)) return [];
      return [
        {
          key: bucket.key,
          name: bucket.name,
          startDate: bucket.iteration?.startDate ?? null,
          left: ((start - windowRange.start) / span) * 100,
          width: Math.max(((finish - start) / span) * 100, 1),
          current: bucket.iteration ? isCurrentIteration(bucket.iteration, now) : false,
        },
      ];
    });
  }, [buckets, windowRange, now]);

  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada que mostrar con estos filtros.</p>;
  }

  const todayPercent =
    windowRange && now >= windowRange.start && now <= windowRange.finish
      ? ((now - windowRange.start) / (windowRange.finish - windowRange.start)) * 100
      : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto pr-1">
      {windowRange ? (
        <div className="mb-4">
          <div className="flex items-center justify-between text-3xs uppercase tracking-wide text-muted-foreground">
            <span>{dayLabel(new Date(windowRange.start).toISOString())}</span>
            <span>{dayLabel(new Date(windowRange.finish).toISOString())}</span>
          </div>
          <div className="relative mt-1 flex gap-0.5 rounded-full bg-muted/60 p-0.5" aria-hidden>
            {rail.map((segment) => (
              <span
                key={segment.key}
                className="h-1.5 rounded-full"
                style={{
                  position: "absolute",
                  left: `${segment.left}%`,
                  width: `${segment.width}%`,
                  backgroundColor: segment.current ? "var(--primary)" : "var(--border)",
                }}
              />
            ))}
            {todayPercent !== null ? (
              <span
                className="absolute -top-1 h-3.5 w-px bg-primary"
                style={{ left: `${todayPercent}%` }}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {buckets.map((bucket) => {
          const iteration = bucket.iteration;
          const current = iteration ? isCurrentIteration(iteration, now) : false;
          const span =
            iteration?.startDate && iteration.finishDate
              ? Math.round(
                  (Date.parse(iteration.finishDate) - Date.parse(iteration.startDate)) / DAY,
                ) + 1
              : null;
          return (
            <section
              key={bucket.key || "none"}
              className="rounded-lg border"
              style={current ? { borderColor: "var(--primary)" } : undefined}
            >
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-3 py-2">
                <h2 className="text-xs font-medium">{bucket.name}</h2>
                {current ? (
                  <span className="rounded-full bg-primary/15 px-2 py-px text-3xs text-primary">
                    en curso
                  </span>
                ) : null}
                <span className="text-3xs text-muted-foreground">
                  {iteration?.startDate && iteration.finishDate
                    ? `${dayLabel(iteration.startDate)} → ${dayLabel(iteration.finishDate)}${span ? ` · ${span} días` : ""}`
                    : "sin fechas en Azure"}
                </span>
                <span className="ml-auto font-mono text-3xs text-muted-foreground">
                  {bucket.items.length}
                </span>
              </header>
              <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
                {bucket.items.map((item) => (
                  <IssueCard
                    key={item.id}
                    item={item}
                    labels={labelsFor(item)}
                    stateColor={states.find((entry) => entry.name === item.state)?.color}
                    showState
                    now={now}
                    compact
                    onOpen={() => onOpen(item)}
                  />
                ))}
                {bucket.items.length === 0 ? (
                  <p className="px-1 py-1 text-2xs text-muted-foreground">
                    Sprint abierto, todavía sin tareas.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
