import { describe, expect, it } from "vite-plus/test";
import type { VaultGraphNode } from "@t3tools/contracts";

import { buildVaultTree, parseVaultNote } from "./brainVault";

const node = (overrides: Partial<VaultGraphNode> & { id: string }): VaultGraphNode => ({
  label: overrides.id.split("/").pop() ?? overrides.id,
  kind: "file",
  folder: "",
  degree: 0,
  bytes: 0,
  modifiedAt: 0,
  depth: 0,
  ...overrides,
});

describe("buildVaultTree", () => {
  it("nests folders and files by their path", () => {
    const tree = buildVaultTree([
      node({ id: "UPANGO", label: "UPANGO", kind: "folder", depth: 0 }),
      node({
        id: "UPANGO/CLIENTES",
        label: "CLIENTES",
        kind: "folder",
        folder: "UPANGO",
        depth: 1,
      }),
      node({ id: "UPANGO/CLIENTES/nota.md", folder: "UPANGO/CLIENTES", depth: 2 }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.label).toBe("UPANGO");
    expect(tree[0]?.children[0]?.label).toBe("CLIENTES");
    expect(tree[0]?.children[0]?.children[0]?.label).toBe("nota.md");
    expect(tree[0]?.children[0]?.children[0]?.kind).toBe("file");
  });

  it("lists folders before files and sorts both by name", () => {
    const tree = buildVaultTree([
      node({ id: "zeta.md" }),
      node({ id: "alfa.md" }),
      node({ id: "carpeta", kind: "folder" }),
    ]);

    expect(tree.map((entry) => entry.label)).toEqual(["carpeta", "alfa.md", "zeta.md"]);
  });

  it("ignores files whose folder is not in the graph", () => {
    expect(buildVaultTree([node({ id: "suelta.md", folder: "fantasma" })])).toEqual([]);
  });
});

describe("parseVaultNote", () => {
  it("splits properties from the body", () => {
    const note = parseVaultNote(
      [
        "---",
        "tags: [arga, b2b]",
        "rama: arga/3.6/2026-01/main",
        "---",
        "",
        "# Titulo",
        "Cuerpo",
      ].join("\n"),
    );

    expect(note.properties).toEqual([
      { key: "tags", values: ["arga", "b2b"] },
      { key: "rama", values: ["arga/3.6/2026-01/main"] },
    ]);
    expect(note.body).toBe("# Titulo\nCuerpo");
  });

  it("leaves a note without frontmatter untouched", () => {
    expect(parseVaultNote("# Hola\n\nmundo")).toEqual({
      properties: [],
      body: "# Hola\n\nmundo",
    });
  });

  it("treats an unterminated frontmatter block as body", () => {
    expect(parseVaultNote("---\ntags: [x]\n# sin cierre").properties).toEqual([]);
  });
});
