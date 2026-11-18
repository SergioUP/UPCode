import type { FileDiffMetadata } from "@pierre/diffs";

/** One run of added or removed lines, placed in the row space of the whole diff. */
export interface DiffMinimapMark {
  readonly kind: "addition" | "deletion";
  /** First row of the run, counted from the top of the first file. */
  readonly row: number;
  readonly rows: number;
  readonly fileIndex: number;
  /** Line number in the new file for additions, in the old file for deletions. */
  readonly line: number;
}

export interface DiffMinimapModel {
  readonly totalRows: number;
  readonly marks: ReadonlyArray<DiffMinimapMark>;
  /** First row of each file, header included. */
  readonly fileStarts: ReadonlyArray<number>;
}

/**
 * Lays every file's change runs out on one vertical axis, a file being as tall as its header plus
 * the rows its hunks show. This is a map of the diff, not a pixel-exact mirror of the viewer, so
 * unchanged lines folded away between hunks count as a single row.
 */
export function buildDiffMinimapModel(files: ReadonlyArray<FileDiffMetadata>): DiffMinimapModel {
  const marks: DiffMinimapMark[] = [];
  const fileStarts: number[] = [];
  let row = 0;
  files.forEach((file, fileIndex) => {
    fileStarts.push(row);
    row += 1;
    for (const hunk of file.hunks) {
      if (hunk.collapsedBefore > 0) row += 1;
      let oldLine = hunk.deletionStart;
      let newLine = hunk.additionStart;
      for (const content of hunk.hunkContent) {
        if (content.type === "context") {
          row += content.lines;
          oldLine += content.lines;
          newLine += content.lines;
          continue;
        }
        if (content.deletions > 0) {
          marks.push({
            kind: "deletion",
            row,
            rows: content.deletions,
            fileIndex,
            line: oldLine,
          });
          row += content.deletions;
          oldLine += content.deletions;
        }
        if (content.additions > 0) {
          marks.push({
            kind: "addition",
            row,
            rows: content.additions,
            fileIndex,
            line: newLine,
          });
          row += content.additions;
          newLine += content.additions;
        }
      }
    }
  });
  return { totalRows: row, marks, fileStarts };
}

/** What a press at `fraction` (0 at the top, 1 at the bottom) should take the reader to. */
export function resolveDiffMinimapTarget(
  model: DiffMinimapModel,
  fraction: number,
): { readonly fileIndex: number; readonly mark: DiffMinimapMark | null } | null {
  if (model.fileStarts.length === 0 || model.totalRows === 0) return null;
  const row = Math.min(Math.max(fraction, 0), 1) * model.totalRows;
  let fileIndex = 0;
  for (let index = 0; index < model.fileStarts.length; index += 1) {
    if (model.fileStarts[index]! <= row) fileIndex = index;
    else break;
  }
  let nearest: DiffMinimapMark | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const mark of model.marks) {
    if (mark.fileIndex !== fileIndex) continue;
    const distance = row < mark.row ? mark.row - row : Math.max(0, row - (mark.row + mark.rows));
    if (distance < nearestDistance) {
      nearest = mark;
      nearestDistance = distance;
    }
  }
  return { fileIndex, mark: nearest };
}
