import type { FileDiffMetadata } from "@pierre/diffs";
import { useMemo, useRef, useState, useLayoutEffect, type PointerEvent } from "react";

import {
  buildDiffMinimapModel,
  resolveDiffMinimapTarget,
  type DiffMinimapMark,
} from "./diffChangeMinimap.logic";

const MARK_MIN_HEIGHT_PX = 2;

/**
 * A strip beside the diff that shows where the changes are, the way an editor's overview ruler
 * does: removed runs in red, added runs in green, the whole change laid out top to bottom.
 * Pressing it goes to the nearest change in the file under the press.
 */
export function DiffChangeMinimap({
  files,
  onNavigate,
}: {
  readonly files: ReadonlyArray<FileDiffMetadata>;
  readonly onNavigate: (target: {
    readonly fileIndex: number;
    readonly mark: DiffMinimapMark | null;
  }) => void;
}) {
  const model = useMemo(() => buildDiffMinimapModel(files), [files]);
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Two paths rather than a node per run: a large change has thousands of them.
  const paths = useMemo(() => {
    let additions = "";
    let deletions = "";
    if (height === 0 || model.totalRows === 0) return { additions, deletions };
    const scale = height / model.totalRows;
    for (const mark of model.marks) {
      const rect = `M0 ${(mark.row * scale).toFixed(2)}h1v${Math.max(mark.rows * scale, MARK_MIN_HEIGHT_PX).toFixed(2)}h-1z`;
      if (mark.kind === "addition") additions += rect;
      else deletions += rect;
    }
    return { additions, deletions };
  }, [height, model]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.height === 0) return;
    const target = resolveDiffMinimapTarget(model, (event.clientY - bounds.top) / bounds.height);
    if (target !== null) onNavigate(target);
  };

  return (
    <div
      ref={ref}
      role="presentation"
      aria-hidden
      title="Where the changes are"
      onPointerDown={onPointerDown}
      className="relative w-3 shrink-0 cursor-pointer border-l border-border/60 bg-muted/20"
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 1 ${Math.max(height, 1)}`}
        preserveAspectRatio="none"
      >
        <path d={paths.deletions} className="fill-destructive/80" />
        <path d={paths.additions} className="fill-success/80" />
      </svg>
    </div>
  );
}
