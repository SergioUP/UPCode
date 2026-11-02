import type { VaultGraphNode } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  categoryColor,
  fileCategory,
  FILE_CATEGORY_STYLES,
  folderColor,
  nodeColorCss,
  nodeRadius,
  wantsLabel,
} from "./graphTheme";

function node(overrides: Partial<VaultGraphNode> = {}): VaultGraphNode {
  return {
    id: "PROYECTOS/ELSA/INDEX.md",
    label: "INDEX.md",
    kind: "file",
    folder: "PROYECTOS/ELSA",
    extension: "md",
    degree: 1,
    bytes: 100,
    modifiedAt: 0,
    depth: 3,
    ...overrides,
  };
}

describe("graphTheme", () => {
  it("maps extensions to the categories the legend shows", () => {
    expect(fileCategory("md")).toBe("note");
    expect(fileCategory("PNG")).toBe("image");
    expect(fileCategory("pdf")).toBe("pdf");
    expect(fileCategory("xlsx")).toBe("office");
    expect(fileCategory("canvas")).toBe("canvas");
    expect(fileCategory("7z")).toBe("other");
    // No extension is "other", never a guess.
    expect(fileCategory(undefined)).toBe("other");
  });

  it("gives every category its own vivid colour", () => {
    const colors = Object.keys(FILE_CATEGORY_STYLES).map((category) =>
      categoryColor(category as keyof typeof FILE_CATEGORY_STYLES),
    );
    expect(new Set(colors).size).toBe(colors.length);
    // Dimming keeps the hue and loses the light.
    expect(categoryColor("note", false)).not.toBe(categoryColor("note", true));
  });

  it("paints by what a node is, not by where it lives", () => {
    const note = nodeColorCss(node(), true);
    const image = nodeColorCss(node({ extension: "png" }), true);
    const folder = nodeColorCss(node({ kind: "folder", id: "PROYECTOS/ELSA" }), true);

    expect(note).not.toBe(image);
    expect(folder).not.toBe(note);
    // Two notes in different folders are the same kind of thing: same colour.
    expect(nodeColorCss(node({ id: "OTRA/nota.md", folder: "OTRA" }), true)).toBe(note);
    // The depth ramp separates levels instead.
    expect(folderColor(1, true)).not.toBe(folderColor(4, true));
  });

  it("draws folders much bigger than files", () => {
    expect(nodeRadius(node({ kind: "file", degree: 0 }))).toBeLessThan(
      nodeRadius(node({ kind: "folder", degree: 0 })),
    );
    expect(nodeRadius(node({ kind: "file", degree: 100 }))).toBeLessThan(
      nodeRadius(node({ kind: "folder", degree: 0 })),
    );
  });

  it("labels every folder, and only connected files in a detailed graph", () => {
    expect(wantsLabel(node({ kind: "folder", degree: 0 }), true)).toBe(true);
    expect(wantsLabel(node({ kind: "folder", degree: 0 }), false)).toBe(true);
    expect(wantsLabel(node({ degree: 1 }), true)).toBe(false);
    expect(wantsLabel(node({ degree: 3 }), true)).toBe(true);
    expect(wantsLabel(node({ degree: 3 }), false)).toBe(false);
  });
});
