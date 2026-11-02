import type { VaultGraphNode } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { clusterHue, folderClusterKey, nodeColorCss, nodeRadius, wantsLabel } from "./graphTheme";

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
  it("clusters by the top-level folder, with a name for the vault root", () => {
    expect(folderClusterKey("PROYECTOS/ELSA/DOCU")).toBe("PROYECTOS");
    expect(folderClusterKey("")).toBe("(raíz)");
  });

  it("gives a cluster the same hue every time it is asked", () => {
    expect(clusterHue("PROYECTOS")).toBe(clusterHue("PROYECTOS"));
    // Two clusters of the same vault are meant to be told apart.
    expect(clusterHue("PROYECTOS")).not.toBe(clusterHue("CLIENTES"));
  });

  it("paints folders and files differently, and dims what does not match", () => {
    const file = nodeColorCss(node(), true);
    const folder = nodeColorCss(node({ kind: "folder", id: "PROYECTOS/ELSA" }), true);

    expect(file).not.toBe(folder);
    expect(nodeColorCss(node(), false)).not.toBe(file);
    // Files in the same cluster share a hue, whatever their name.
    expect(nodeColorCss(node({ id: "PROYECTOS/ELSA/otra.md" }), true)).toBe(file);
  });

  it("sizes a node by its degree, with folders above files", () => {
    expect(nodeRadius(node({ degree: 1 }))).toBeLessThan(nodeRadius(node({ degree: 40 })));
    expect(nodeRadius(node({ kind: "file", degree: 0 }))).toBeLessThan(
      nodeRadius(node({ kind: "folder", degree: 0 })),
    );
  });

  it("labels every folder, and only connected files in a detailed graph", () => {
    expect(wantsLabel(node({ kind: "folder", degree: 0 }), true)).toBe(true);
    expect(wantsLabel(node({ kind: "folder", degree: 0 }), false)).toBe(true);
    expect(wantsLabel(node({ degree: 1 }), true)).toBe(false);
    expect(wantsLabel(node({ degree: 3 }), true)).toBe(true);
    // A big vault keeps folder labels and drops the file ones.
    expect(wantsLabel(node({ degree: 3 }), false)).toBe(false);
  });
});
