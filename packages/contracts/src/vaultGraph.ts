import * as Schema from "effect/Schema";
import { NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * The vault graph is what the 3D brain renders.
 *
 * It is built from the **shape** of the vault — folders, files and how they
 * contain each other — and never from what is written inside a file. That keeps
 * the picture valid for any vault, of any size, edited by anyone, without this
 * code knowing or caring what the notes say.
 *
 * @module VaultGraph
 */

export const VAULT_GRAPH_PATH_MAX_LENGTH = 512;
/**
 * Entries walked per scan. Deliberately generous: a vault is expected to grow,
 * and dropping files silently would make the picture lie. Past this the scan
 * says `truncated` so the screen can point at a narrower root instead.
 */
export const VAULT_GRAPH_DEFAULT_MAX_ENTRIES = 40000;
export const VAULT_GRAPH_MAX_ENTRIES = 120000;

export const VaultGraphNodeKind = Schema.Literals(["folder", "file"]);
export type VaultGraphNodeKind = typeof VaultGraphNodeKind.Type;

export const VaultGraphLinkKind = Schema.Literals(["contains", "sameName"]);
export type VaultGraphLinkKind = typeof VaultGraphLinkKind.Type;

export const VaultGraphNode = Schema.Struct({
  /** Vault-relative path, so two files with the same name never collide. */
  id: TrimmedNonEmptyString,
  /** What the scene writes on the node: a file name or a folder name. */
  label: TrimmedNonEmptyString,
  kind: VaultGraphNodeKind,
  /** Vault-relative folder that contains it; empty for the vault root. */
  folder: Schema.String,
  /** Lowercased extension without the dot, for files only. */
  extension: Schema.optionalKey(Schema.String),
  /** How many edges touch the node. Drives both size and brightness. */
  degree: NonNegativeInt,
  /** Bytes on disk for files, zero for folders. */
  bytes: NonNegativeInt,
  /** Epoch milliseconds of the last write, for recency-driven emphasis. */
  modifiedAt: NonNegativeInt,
  /** How deep it sits below the vault root; the root is 0. */
  depth: NonNegativeInt,
});
export type VaultGraphNode = typeof VaultGraphNode.Type;

export const VaultGraphLink = Schema.Struct({
  source: TrimmedNonEmptyString,
  target: TrimmedNonEmptyString,
  /**
   * `contains` is a file in its folder (or a folder in its parent); `sameName`
   * joins files that share a name across folders, which is the one relation
   * worth drawing that the hierarchy alone does not give.
   */
  kind: VaultGraphLinkKind,
});
export type VaultGraphLink = typeof VaultGraphLink.Type;

export const VaultGraphScanInput = Schema.Struct({
  vaultPath: TrimmedNonEmptyString.check(Schema.isMaxLength(VAULT_GRAPH_PATH_MAX_LENGTH)),
  maxEntries: Schema.optionalKey(NonNegativeInt),
  /**
   * Cheap mode for the "has the vault changed?" poll: it walks the tree and
   * hashes paths, sizes and mtimes. The answer carries the fingerprint and the
   * counts only.
   */
  probe: Schema.optionalKey(Schema.Boolean),
});
export type VaultGraphScanInput = typeof VaultGraphScanInput.Type;

export const VaultGraphSnapshot = Schema.Struct({
  vaultPath: TrimmedNonEmptyString,
  scannedAt: NonNegativeInt,
  durationMs: NonNegativeInt,
  /**
   * Hash of every entry's path, size and mtime. Two scans with the same
   * fingerprint describe the same vault, which is how the screen notices that a
   * vault changed without fetching the whole graph again.
   */
  fingerprint: TrimmedNonEmptyString,
  /** True when the walk stopped at `maxEntries` instead of the end of the vault. */
  truncated: Schema.Boolean,
  fileCount: NonNegativeInt,
  folderCount: NonNegativeInt,
  /** Files joined to another file of the same name in a different folder. */
  sameNameLinkCount: NonNegativeInt,
  /** Names shared by too many files to be a useful relation. */
  ambiguousNameCount: NonNegativeInt,
  nodes: Schema.Array(VaultGraphNode),
  links: Schema.Array(VaultGraphLink),
});
export type VaultGraphSnapshot = typeof VaultGraphSnapshot.Type;

export const VaultGraphFailure = Schema.Literals([
  "vault_not_found",
  "vault_not_a_directory",
  "read_failed",
]);
export type VaultGraphFailure = typeof VaultGraphFailure.Type;

export class VaultGraphError extends Schema.TaggedError<VaultGraphError>()("VaultGraphError", {
  vaultPath: Schema.optional(TrimmedNonEmptyString),
  failure: Schema.optional(VaultGraphFailure),
  message: TrimmedNonEmptyString,
  cause: Schema.optional(Schema.Defect()),
}) {}
