import type { FileDiffMetadata } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDiffMinimapModel,
  buildDiffMinimapPaths,
  resolveDiffMinimapTarget,
} from "./diffChangeMinimap.logic";

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
  it("aligns paired additions and deletions in split view", () => {
    const model = buildDiffMinimapModel(sample, "split");
    expect(model.fileStarts).toEqual([0, 8]);
    expect(model.totalRows).toBe(12);
    expect(model.marks.slice(0, 2).map(({ row, line }) => ({ row, line }))).toEqual([
      { row: 3, line: 3 },
      { row: 3, line: 3 },
    ]);
    expect(resolveDiffMinimapTarget(model, 3 / model.totalRows, "deletion")?.mark?.kind).toBe(
      "deletion",
    );
    expect(resolveDiffMinimapTarget(model, 3 / model.totalRows, "addition")?.mark?.kind).toBe(
      "addition",
    );
  });
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

describe("minimap mark geometry", () => {
  it("separates red and green lanes even when small marks share pixels", () => {
    const paths = buildDiffMinimapPaths(buildDiffMinimapModel(sample, "split"), 10);
    expect(paths.deletions).toMatch(/^M0 /);
    expect(paths.additions).toMatch(/^M1 /);
  });
  it("keeps minimum-height marks within a very short rail", () => {
    const paths = buildDiffMinimapPaths(
      {
        totalRows: 10000,
        fileStarts: [0],
        marks: [{ kind: "addition", row: 9999, rows: 1, fileIndex: 0, line: 1 }],
      },
      1,
    );
    expect(paths.additions).toBe("M1 0.00h1v1.00h-1z");
  });
  it("draws nothing while the rail has no measured height", () => {
    expect(buildDiffMinimapPaths(buildDiffMinimapModel(sample), 0)).toEqual({
      additions: "",
      deletions: "",
    });
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
