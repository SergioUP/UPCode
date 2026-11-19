import type { FileDiffMetadata } from "@pierre/diffs";
import { useMemo, useRef, useState, useLayoutEffect, type PointerEvent } from "react";
import { observeResize } from "~/lib/observeResize";

import {
  buildDiffMinimapModel,
  buildDiffMinimapPaths,
  resolveDiffMinimapTarget,
  type DiffMinimapMark,
} from "./diffChangeMinimap.logic";

/**
 * A strip beside the diff that shows where the changes are, the way an editor's overview ruler
 * does: removed runs in red, added runs in green, the whole change laid out top to bottom.
 * Pressing it goes to the nearest change in the file under the press.
 */
export function DiffChangeMinimap({
  files,
  layout = "unified",
  onNavigate,
}: {
  readonly files: ReadonlyArray<FileDiffMetadata>;
  readonly layout?: "split" | "unified";
  readonly onNavigate: (target: {
    readonly fileIndex: number;
    readonly mark: DiffMinimapMark | null;
  }) => void;
}) {
  const model = useMemo(() => buildDiffMinimapModel(files, layout), [files, layout]);
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    return observeResize(element, () => setHeight(element.clientHeight));
  }, []);

  // Two paths rather than a node per run: a large change has thousands of them.
  const paths = useMemo(() => buildDiffMinimapPaths(model, height), [height, model]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.height === 0 || event.button !== 0) return;
    const kind = event.clientX < bounds.left + bounds.width / 2 ? "deletion" : "addition";
    const target = resolveDiffMinimapTarget(
      model,
      (event.clientY - bounds.top) / bounds.height,
      kind,
    );
    if (target !== null) onNavigate(target);
  };

  return (
    <div
      ref={ref}
      role="presentation"
      aria-hidden
      onPointerDown={onPointerDown}
      className="relative w-3 shrink-0 cursor-pointer border-l border-border/60 bg-muted/20"
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 2 ${Math.max(height, 1)}`}
        preserveAspectRatio="none"
      >
        <path d={paths.deletions} className="fill-diff-deletion" />
        <path d={paths.additions} className="fill-diff-addition" />
      </svg>
    </div>
  );
}
