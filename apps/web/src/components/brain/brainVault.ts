import type { VaultGraphNode } from "@t3tools/contracts";

/** A folder or a file as the explorer draws it, built from the graph's flat paths. */
export interface VaultTreeEntry {
  readonly id: string;
  readonly label: string;
  readonly kind: VaultGraphNode["kind"];
  readonly depth: number;
  readonly children: ReadonlyArray<VaultTreeEntry>;
}

/**
 * Builds the explorer's tree from the graph nodes alone: the scan already
 * carries every path, so the explorer needs no second request and can never
 * disagree with the picture.
 */
export function buildVaultTree(nodes: ReadonlyArray<VaultGraphNode>): VaultTreeEntry[] {
  const folders = new Map<string, VaultGraphNode>();
  const files = new Map<string, VaultGraphNode>();
  for (const node of nodes) {
    if (node.kind === "folder") folders.set(node.id, node);
    else files.set(node.id, node);
  }

  const childrenOf = (parent: string): VaultTreeEntry[] => {
    const direct = [...folders.values()].filter((folder) => folder.folder === parent);
    const filesHere = [...files.values()].filter((file) => file.folder === parent);
    return [
      ...direct
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((folder): VaultTreeEntry => ({
          id: folder.id,
          label: folder.label,
          kind: "folder",
          depth: folder.depth,
          children: childrenOf(folder.id),
        })),
      ...filesHere
        .sort((left, right) => left.label.localeCompare(right.label))
        .map((file): VaultTreeEntry => ({
          id: file.id,
          label: file.label,
          kind: "file",
          depth: file.depth,
          children: [],
        })),
    ];
  };

  return childrenOf("");
}

/** Frontmatter properties, in the order the note writes them. */
export interface VaultNote {
  readonly properties: ReadonlyArray<{
    readonly key: string;
    readonly values: ReadonlyArray<string>;
  }>;
  readonly body: string;
}

const FRONTMATTER_DELIMITER = "---";

/** A tiny `key: value` / `key: [a, b]` reader: enough for Obsidian properties. */
function parseValue(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
      .filter((entry) => entry.length > 0);
  }
  const single = trimmed.replace(/^["']|["']$/g, "");
  return single.length > 0 ? [single] : [];
}

/**
 * Splits a note into its YAML frontmatter and its markdown body. Anything that
 * is not a leading `---` block is body, so a note without properties renders
 * exactly as it is written.
 */
export function parseVaultNote(text: string): VaultNote {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return { properties: [], body: normalized };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_DELIMITER);
  if (end === -1) return { properties: [], body: normalized };

  const properties: Array<{ key: string; values: string[] }> = [];
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_\-. ]+):(.*)$/.exec(line);
    if (!match?.[1]) continue;
    const key = match[1].trim();
    const values = parseValue(match[2] ?? "");
    if (key.length === 0 || values.length === 0) continue;
    properties.push({ key, values });
  }
  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return { properties, body };
}

/** Two spaces of indent per level, as the tree draws it. */
export function vaultEntryIndent(depth: number): number {
  return Math.max(0, depth) * 12;
}
