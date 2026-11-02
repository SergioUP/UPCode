import type { VaultGraphNode } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  BRAIN_BACKGROUND,
  fileExtensionColor,
  folderColor,
  nodeColorCss,
  nodeRadius,
  wantsLabel,
} from "./graphTheme";

function node(overrides: Partial<VaultGraphNode> = {}): VaultGraphNode {
  return {
    id: "docs/guias/INICIO.md",
    label: "INDEX.md",
    kind: "file",
    folder: "docs/guias",
    extension: "md",
    degree: 1,
    bytes: 100,
    modifiedAt: 0,
    depth: 3,
    ...overrides,
  };
}

describe("graphTheme", () => {
  it("draws on pure black so the nodes carry the light", () => {
    expect(BRAIN_BACKGROUND).toBe("#000000");
  });

  it("gives every extension its own colour, known or not", () => {
    const known = ["md", "pdf", "png", "json", "canvas", "xlsx"].map((extension) =>
      fileExtensionColor(extension),
    );
    expect(new Set(known).size).toBe(known.length);

    // An extension nobody mapped still gets a stable hue instead of grey.
    const unknown = fileExtensionColor("customext");
    expect(unknown).toMatch(/^hsl\(/);
    expect(fileExtensionColor("customext")).toBe(unknown);
    expect(unknown).not.toBe(fileExtensionColor("otraext"));
  });

  it("colours files by extension and folders as quiet structure", () => {
    const note = nodeColorCss(node(), true);
    const image = nodeColorCss(node({ extension: "png" }), true);
    const folder = nodeColorCss(node({ kind: "folder", id: "docs/guias" }), true);

    expect(note).not.toBe(image);
    expect(folder).not.toBe(note);
    // Folders are one family: only the depth makes them differ.
    expect(folderColor(1, true)).not.toBe(folderColor(5, true));
    // Two notes in different folders are the same kind of thing.
    expect(nodeColorCss(node({ id: "otra/nota.md", folder: "OTRA" }), true)).toBe(note);
  });

  it("keeps folders small enough to be a skeleton, not the picture", () => {
    const folder = nodeRadius(node({ kind: "folder", degree: 40 }));
    const foldedFolder = nodeRadius(node({ kind: "folder", degree: 0 }));
    const file = nodeRadius(node({ kind: "file", degree: 0 }));

    expect(foldedFolder).toBeGreaterThan(file);
    // Even a huge folder stays close to a leaf dot.
    expect(folder).toBeLessThan(file * 3.5);
  });

  it("labels every folder, and only connected files in a detailed graph", () => {
    expect(wantsLabel(node({ kind: "folder", degree: 0 }), true)).toBe(true);
    expect(wantsLabel(node({ kind: "folder", degree: 0 }), false)).toBe(true);
    expect(wantsLabel(node({ degree: 1 }), true)).toBe(false);
    expect(wantsLabel(node({ degree: 3 }), true)).toBe(true);
    expect(wantsLabel(node({ degree: 3 }), false)).toBe(false);
  });
});
