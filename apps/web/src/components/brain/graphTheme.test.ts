import type { VaultGraphNode } from "@upcode/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  BRAIN_BACKGROUND,
  clusterHue,
  fileColor,
  folderClusterKey,
  folderColor,
  nodeColorCss,
  nodeRadius,
  wantsLabel,
} from "./graphTheme";

function node(overrides: Partial<VaultGraphNode> = {}): VaultGraphNode {
  return {
    id: "docs/guias/INICIO.md",
    label: "INICIO.md",
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
  it("draws on pure black with hex colours three can always parse", () => {
    expect(BRAIN_BACKGROUND).toBe("#000000");
    // a white fallback would be the symptom of an unparsable colour
    expect(fileColor("docs/guias", "md")).toMatch(/^#[0-9a-f]{6}$/);
    expect(folderColor(2, true)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("gives each top-level folder its own hue so a markdown vault is colourful", () => {
    expect(folderClusterKey("docs/guias/2026")).toBe("docs");
    expect(folderClusterKey("")).toBe("(raíz)");

    const hues = ["docs", "clientes", "proyectos", "formacion", "mejoras"].map((folder) =>
      clusterHue(folder),
    );
    // Five different clusters must not collapse into one hue.
    expect(new Set(hues).size).toBeGreaterThanOrEqual(4);
  });

  it("keeps the same folder family even when the file type differs", () => {
    const note = fileColor("docs", "md");
    const image = fileColor("docs", "png");
    const otherFolder = fileColor("clientes", "md");

    // A type changes the tone, a folder changes the hue.
    expect(note).not.toBe(image);
    expect(note).not.toBe(otherFolder);
    expect(nodeColorCss(node(), true)).toBe(note);
  });

  it("dims what a filter turned off", () => {
    expect(nodeColorCss(node(), false)).not.toBe(nodeColorCss(node(), true));
    expect(fileColor("docs", "md", false)).not.toBe(fileColor("docs", "md", true));
  });

  it("keeps folders small enough to be a skeleton, not the picture", () => {
    const folder = nodeRadius(node({ kind: "folder", degree: 40 }));
    const foldedFolder = nodeRadius(node({ kind: "folder", degree: 0 }));
    const file = nodeRadius(node({ kind: "file", degree: 0 }));

    expect(foldedFolder).toBeGreaterThan(file);
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
