/**
 * The pull-request diff arrives as one unified patch, so this is the smallest reader that turns
 * it into something a list can draw: one entry per file, with its fate, its line counts and its
 * lines already classified. It is deliberately not a diff engine — it never computes a diff, it
 * only reads the one the host produced.
 */
export type PatchLineKind = "add" | "delete" | "context" | "hunk" | "meta";

export interface PatchLine {
  readonly kind: PatchLineKind;
  readonly text: string;
}

export type PatchFileStatus = "new" | "deleted" | "modified" | "renamed";

export interface PatchFile {
  /** The path after the change, or the path before it for a deleted file. */
  readonly path: string;
  readonly previousPath?: string;
  readonly status: PatchFileStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly lines: ReadonlyArray<PatchLine>;
}

const stripPrefix = (value: string, prefix: string): string =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value;

const parseGitHeaderPaths = (line: string): { from: string; to: string } | null => {
  const rest = line.slice("diff --git ".length).trim();
  const match = rest.match(/^a\/(.+?) b\/(.+)$/);
  return match?.[1] && match[2] ? { from: match[1], to: match[2] } : null;
};

export const parsePatch = (patch: string): PatchFile[] => {
  const files: PatchFile[] = [];
  let current: {
    path: string;
    previousPath?: string;
    status: PatchFileStatus;
    additions: number;
    deletions: number;
    lines: PatchLine[];
    inHunks: boolean;
  } | null = null;

  const flush = () => {
    if (!current) return;
    files.push({
      path: current.path,
      ...(current.previousPath ? { previousPath: current.previousPath } : {}),
      status: current.status,
      additions: current.additions,
      deletions: current.deletions,
      lines: current.lines,
    });
    current = null;
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      const paths = parseGitHeaderPaths(line);
      current = {
        path: paths?.to ?? "",
        ...(paths && paths.from !== paths.to ? { previousPath: paths.from } : {}),
        status: "modified",
        additions: 0,
        deletions: 0,
        lines: [],
        inHunks: false,
      };
      continue;
    }
    if (!current) continue;

    if (line.startsWith("new file mode")) {
      current.status = "new";
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      const previous = stripPrefix(line, "rename from ").trim();
      if (previous) current.previousPath = previous;
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = stripPrefix(line, "rename to ").trim() || current.path;
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = stripPrefix(line, "--- ").trim();
      if (path === "/dev/null") current.status = "new";
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = stripPrefix(line, "+++ ").trim();
      if (path === "/dev/null") current.status = "deleted";
      else if (path && path !== "b/" && current.path === "") current.path = stripPrefix(path, "b/");
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("@@")) {
      current.inHunks = true;
      current.lines.push({ kind: "hunk", text: line });
      continue;
    }
    if (!current.inHunks) {
      // Headers such as `index`, `similarity index` or `Binary files … differ`.
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    if (line.startsWith("+")) {
      current.additions += 1;
      current.lines.push({ kind: "add", text: line });
      continue;
    }
    if (line.startsWith("-")) {
      current.deletions += 1;
      current.lines.push({ kind: "delete", text: line });
      continue;
    }
    if (line.startsWith("\\")) {
      current.lines.push({ kind: "meta", text: line });
      continue;
    }
    current.lines.push({ kind: "context", text: line });
  }

  flush();
  return files;
};

/** One line of the patch as it should be read, without its leading marker. */
export const patchLineText = (line: PatchLine): string =>
  line.kind === "add" || line.kind === "delete" || line.kind === "context"
    ? line.text.slice(1)
    : line.text;
