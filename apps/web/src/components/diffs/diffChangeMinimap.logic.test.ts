import type { FileDiffMetadata } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";

import { buildDiffMinimapModel, resolveDiffMinimapTarget } from "./diffChangeMinimap.logic";

const file = (hunks: unknown): FileDiffMetadata => ({ hunks }) as unknown as FileDiffMetadata;

const sample = [
  file([
    {
      collapsedBefore: 0,
      deletionStart: 1,
      additionStart: 1,
      hunkContent: [
        { type: "context", lines: 2 },
        { type: "change", deletions: 1, additions: 3 },
        { type: "context", lines: 2 },
      ],
    },
  ]),
  file([
    {
      collapsedBefore: 4,
      deletionStart: 10,
      additionStart: 12,
      hunkContent: [{ type: "change", deletions: 0, additions: 2 }],
    },
  ]),
];

describe("buildDiffMinimapModel", () => {
  it("places removed and added runs with their own line numbers", () => {
    const model = buildDiffMinimapModel(sample);
    expect(model.fileStarts).toEqual([0, 9]);
    expect(model.totalRows).toBe(9 + 1 + 1 + 2);
    expect(model.marks).toEqual([
      { kind: "deletion", row: 3, rows: 1, fileIndex: 0, line: 3 },
      { kind: "addition", row: 4, rows: 3, fileIndex: 0, line: 3 },
      { kind: "addition", row: 11, rows: 2, fileIndex: 1, line: 12 },
    ]);
  });
});

describe("resolveDiffMinimapTarget", () => {
  it("picks the file under the press and its nearest change", () => {
    const model = buildDiffMinimapModel(sample);
    const target = resolveDiffMinimapTarget(model, 12 / model.totalRows);
    expect(target?.fileIndex).toBe(1);
    expect(target?.mark?.line).toBe(12);
  });

  it("has no target for an empty diff", () => {
    expect(resolveDiffMinimapTarget(buildDiffMinimapModel([]), 0.5)).toBeNull();
  });
});
