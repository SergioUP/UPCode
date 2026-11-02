/**
 * VaultGraphScanner - turns the *shape* of an Obsidian vault (or of any folder
 * of documents) into the graph the 3D brain draws.
 *
 * Design notes worth keeping:
 *
 * - **No file is ever opened.** Nodes come from the directory walk: folders,
 *   files, their extension, size and mtime. Nothing inside a note is read,
 *   parsed or sent anywhere, which is what makes this work unchanged for any
 *   vault: notes, attachments, PDFs, a vault that is not even Obsidian.
 * - **Bounded on purpose.** `maxEntries` caps the walk so a huge tree cannot
 *   stall the RPC, and `truncated` says so instead of pretending completeness.
 * - **One bad folder never fails the scan.** An unreadable directory is skipped.
 *
 * @module vaultGraph/VaultGraphScanner
 */

// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";

import {
  VAULT_GRAPH_DEFAULT_MAX_ENTRIES,
  VAULT_GRAPH_MAX_ENTRIES,
  VaultGraphError,
  type VaultGraphLink,
  type VaultGraphNode,
  type VaultGraphScanInput,
  type VaultGraphSnapshot,
} from "@t3tools/contracts";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as HostProcess from "@t3tools/shared/HostProcess";

/** Directories that are never part of the picture. */
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".stfolder",
  ".stversions",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
]);

/** Protection against a symlink loop or a vault nested in itself. */
const MAX_WALK_DEPTH = 32;
/** Stats fetched in parallel while the walk is being described. */
const STAT_CONCURRENCY = 32;
/**
 * `INDEX.md` in thirty folders is a convention worth drawing; a name shared by a
 * hundred files would just turn one node into a hub of noise.
 */
const MAX_SAME_NAME_GROUP = 40;

interface WalkedEntry {
  readonly filePath: string;
  readonly relativePath: string;
  readonly depth: number;
  readonly kind: "folder" | "file";
  readonly label: string;
  readonly folder: string;
  readonly extension: string | undefined;
}

export class VaultGraphScanner extends Context.Service<
  VaultGraphScanner,
  {
    readonly scan: (
      input: VaultGraphScanInput,
    ) => Effect.Effect<VaultGraphSnapshot, VaultGraphError>;
  }
>()("t3/vaultGraph/VaultGraphScanner") {}

function toVaultError(vaultPath: string, cause: unknown): VaultGraphError {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  const failure =
    code === "ENOENT"
      ? "vault_not_found"
      : code === "ENOTDIR"
        ? "vault_not_a_directory"
        : "read_failed";
  const detail =
    code === "ENOENT"
      ? "The vault path does not exist."
      : code === "ENOTDIR"
        ? "The vault path is not a directory."
        : "The vault could not be read.";
  return new VaultGraphError({ vaultPath, failure, message: detail, cause });
}

function splitName(name: string): { label: string; extension: string | undefined } {
  const dot = name.lastIndexOf(".");
  // A dotfile (`notes.md` is fine, `.gitignore` is not) has no extension worth
  // grouping by, and a leading dot must never be read as one.
  if (dot <= 0 || dot === name.length - 1) return { label: name, extension: undefined };
  return { label: name, extension: name.slice(dot + 1).toLowerCase() };
}

const scanImplementation = Effect.fn("VaultGraphScanner.scan")(function* (
  input: VaultGraphScanInput,
  path: Path.Path,
): Effect.fn.Return<VaultGraphSnapshot, VaultGraphError, never> {
  const home = yield* HostProcess.HomeDirectory;
  const startedAt = yield* Clock.currentTimeMillis;
  const vaultPath = path.resolve(expandHomePath(input.vaultPath, home));
  const maxEntries = Math.min(
    input.maxEntries ?? VAULT_GRAPH_DEFAULT_MAX_ENTRIES,
    VAULT_GRAPH_MAX_ENTRIES,
  );

  const vaultStats = yield* Effect.tryPromise({
    try: () => NodeFSP.stat(vaultPath),
    catch: (cause) => toVaultError(vaultPath, cause),
  });
  if (!vaultStats.isDirectory()) {
    return yield* new VaultGraphError({
      vaultPath,
      failure: "vault_not_a_directory",
      message: "The vault path is not a directory.",
    });
  }

  const entries: WalkedEntry[] = [];
  let truncated = false;

  const walk = (
    directoryPath: string,
    relativeDirectory: string,
    depth: number,
  ): Effect.Effect<void, VaultGraphError> =>
    Effect.gen(function* () {
      if (truncated || depth > MAX_WALK_DEPTH) return;
      const dirents = yield* Effect.tryPromise({
        try: () => NodeFSP.readdir(directoryPath, { withFileTypes: true }),
        catch: (cause) => toVaultError(vaultPath, cause),
      }).pipe(
        // A folder the OS refuses to list is skipped, not fatal: a permissions
        // problem in one corner should not blank the whole brain.
        Effect.catchIf(
          (error) => {
            const code = (error.cause as NodeJS.ErrnoException | undefined)?.code;
            return code === "EACCES" || code === "EPERM";
          },
          () => Effect.succeed([]),
        ),
      );
      // Sorted so two scans of the same vault produce the same graph.
      const ordered = dirents.toSorted((left, right) => left.name.localeCompare(right.name));
      for (const dirent of ordered) {
        if (truncated) return;
        const name = dirent.name;
        if (name.startsWith(".")) continue;
        const relativePath = relativeDirectory.length === 0 ? name : `${relativeDirectory}/${name}`;
        if (dirent.isDirectory()) {
          if (SKIPPED_DIRECTORIES.has(name.toLowerCase())) continue;
          if (entries.length >= maxEntries) {
            truncated = true;
            return;
          }
          entries.push({
            filePath: path.join(directoryPath, name),
            relativePath,
            depth,
            kind: "folder",
            label: name,
            folder: relativeDirectory,
            extension: undefined,
          });
          yield* walk(path.join(directoryPath, name), relativePath, depth + 1);
          continue;
        }
        if (!dirent.isFile()) continue;
        // `.md`, `.png`, `.pdf`, `.canvas`: all of them are part of the shape.
        const { label, extension } = splitName(name);
        if (entries.length >= maxEntries) {
          truncated = true;
          return;
        }
        entries.push({
          filePath: path.join(directoryPath, name),
          relativePath,
          depth,
          kind: "file",
          label,
          folder: relativeDirectory,
          extension,
        });
      }
    });

  yield* walk(vaultPath, "", 1);

  /**
   * Sizes and mtimes are the only thing a stat gives away, and they are what
   * makes the picture honest: a big file reads bigger, a recently edited one is
   * brighter. Nothing is opened.
   */
  const stats = yield* Effect.forEach(
    entries,
    (entry) =>
      Effect.tryPromise({
        try: async () => {
          const result = await NodeFSP.stat(entry.filePath);
          return { bytes: result.size, modifiedAt: Math.round(result.mtimeMs) };
        },
        catch: () => null,
      }).pipe(Effect.orElseSucceed(() => null)),
    { concurrency: STAT_CONCURRENCY },
  );

  let fingerprintHash = 2166136261;
  for (const [index, entry] of entries.entries()) {
    const stat = stats[index];
    const stamp = `${entry.relativePath}\u0000${entry.kind}\u0000${stat?.bytes ?? -1}\u0000${stat?.modifiedAt ?? -1}\n`;
    for (let character = 0; character < stamp.length; character += 1) {
      fingerprintHash ^= stamp.charCodeAt(character);
      fingerprintHash = Math.imul(fingerprintHash, 16777619);
    }
  }
  const fingerprint = `${entries.length}-${(fingerprintHash >>> 0).toString(36)}`;

  const fileCount = entries.filter((entry) => entry.kind === "file").length;
  const folderCount = entries.length - fileCount;

  if (input.probe === true) {
    return {
      vaultPath,
      scannedAt: startedAt,
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
      fingerprint,
      truncated,
      fileCount,
      folderCount,
      sameNameLinkCount: 0,
      ambiguousNameCount: 0,
      nodes: [],
      links: [],
    };
  }

  const degree = new Map<string, number>();
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);
  const links: VaultGraphLink[] = [];

  // A file belongs to its folder; a folder belongs to its parent. The vault root
  // has no node of its own, so top-level entries simply hang from each other.
  for (const entry of entries) {
    if (entry.folder.length === 0) continue;
    links.push({ source: entry.relativePath, target: entry.folder, kind: "contains" });
    bump(entry.relativePath);
    bump(entry.folder);
  }

  // The one cross-folder relation that is visible from the outside: files that
  // share a name (`INDEX.md`, `README.md`, one per project).
  const byLabel = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.kind !== "file" || entry.extension !== "md") continue;
    const key = entry.label.toLowerCase();
    const existing = byLabel.get(key);
    if (existing === undefined) byLabel.set(key, [entry.relativePath]);
    else existing.push(entry.relativePath);
  }
  let sameNameLinkCount = 0;
  let ambiguousNameCount = 0;
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    if (group.length > MAX_SAME_NAME_GROUP) {
      ambiguousNameCount += 1;
      continue;
    }
    const [first, ...rest] = group;
    if (first === undefined) continue;
    for (const other of rest) {
      links.push({ source: first, target: other, kind: "sameName" });
      bump(first);
      bump(other);
      sameNameLinkCount += 1;
    }
  }

  const nodes: VaultGraphNode[] = entries.map((entry, index) => ({
    id: entry.relativePath,
    label: entry.label,
    kind: entry.kind,
    folder: entry.folder,
    ...(entry.extension === undefined ? {} : { extension: entry.extension }),
    degree: degree.get(entry.relativePath) ?? 0,
    bytes: stats[index]?.bytes ?? 0,
    modifiedAt: stats[index]?.modifiedAt ?? 0,
    depth: entry.depth,
  }));

  return {
    vaultPath,
    scannedAt: startedAt,
    durationMs: (yield* Clock.currentTimeMillis) - startedAt,
    fingerprint,
    truncated,
    fileCount,
    folderCount,
    sameNameLinkCount,
    ambiguousNameCount,
    nodes,
    links,
  };
});

export const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const scan: VaultGraphScanner["Service"]["scan"] = (input) =>
    scanImplementation(input, path).pipe(
      Effect.tapError((error) => Effect.logWarning("Vault graph scan failed", { error })),
    );
  return VaultGraphScanner.of({ scan });
});

export const layer = Layer.effect(VaultGraphScanner, make);
