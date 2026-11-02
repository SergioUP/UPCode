"use client";

import type { EnvironmentId } from "@t3tools/contracts";
import { FolderOpenIcon, ScanSearchIcon, StarIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { filesystemEnvironment } from "../../state/filesystem";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { vaultGraph } from "../../state/vaultGraph";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

/** What the chosen folder looks like from the outside. */
export type VaultRootKind = "obsidian" | "plain";

export interface VaultPickerProps {
  readonly environmentId: EnvironmentId;
  readonly recents: ReadonlyArray<string>;
  readonly scanning: boolean;
  readonly onPick: (vaultPath: string, kind: VaultRootKind) => void;
}

/** Appends the platform separator so browsing shows what is inside. */
function withSeparator(value: string): string {
  if (value.length === 0) return value;
  const separator = value.includes("\\") || /^[A-Za-z]:/.test(value) ? "\\" : "/";
  return `${value.replace(/[\\/]+$/, "")}${separator}`;
}

/**
 * Picking a vault.
 *
 * The folder is normally chosen with the operating system's own picker: in the
 * desktop app the shell opens it, and the path it returns is what the server
 * reads. In a browser there is no such bridge (a directory handle is not a
 * path the server could open), so the same dialog falls back to the server's
 * own directory listing, which drills down from `~/`.
 *
 * The vault root is the folder that holds `.obsidian`. That is checked — a
 * stat, nothing read — so picking a subfolder by mistake is noticed before the
 * graph lies about its scope. It is a warning, never a block: any folder plots
 * fine, and not every vault is Obsidian's.
 */
export function VaultPicker({ environmentId, recents, scanning, onPick }: VaultPickerProps) {
  const [draft, setDraft] = useState("");
  const listingRef = useRef<HTMLDivElement | null>(null);
  const inspectFolder = useAtomCommand(vaultGraph.metadata, { reportFailure: false });
  const desktopBridge = typeof window === "undefined" ? undefined : window.desktopBridge;

  // Listing what is inside a folder needs the separator; listing who matches a
  // partial name does not. The same RPC answers both.
  const browsePath = useMemo(() => (draft.length === 0 ? "~/" : draft), [draft]);
  const suggestions = useEnvironmentQuery(
    filesystemEnvironment.browse({ environmentId, input: { partialPath: browsePath } }),
  );

  const entries = suggestions.data?.entries ?? [];
  const parentPath = suggestions.data?.parentPath ?? null;

  /**
   * A folder is a vault root when it contains `.obsidian`. Everything else is a
   * plain folder: still plotted, just not the root of an Obsidian vault.
   */
  const resolveRootKind = useCallback(
    async (candidate: string): Promise<VaultRootKind> => {
      const result = await inspectFolder({
        environmentId,
        input: { paths: [`${candidate.replace(/[\\/]+$/, "")}/.obsidian`] },
      });
      if (result._tag !== "Success") return "plain";
      return result.value.entries[0]?.kind === "directory" ? "obsidian" : "plain";
    },
    [environmentId, inspectFolder],
  );

  const scanDraftFrom = useCallback(
    async (candidate: string) => {
      const cleaned = candidate.replace(/[\\/]+$/, "");
      if (cleaned.length === 0) return;
      setDraft(withSeparator(cleaned));
      const kind = await resolveRootKind(cleaned);
      onPick(cleaned, kind);
    },
    [onPick, resolveRootKind],
  );

  const openFolderPicker = async () => {
    const bridge = window.desktopBridge;
    if (bridge === undefined) {
      // No shell to ask. The server can still list its own folders, so the
      // button does something useful instead of vanishing.
      setDraft(withSeparator("~"));
      listingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    const picked = await bridge.pickFolder({
      initialPath: draft.replace(/[\\/]+$/, "").length > 0 ? draft.replace(/[\\/]+$/, "") : null,
      // The dialog belongs to the machine that will read the folder, which is
      // not necessarily the one this window runs on.
      targetEnvironmentId: environmentId,
    });
    if (picked === null || picked.length === 0) return;
    await scanDraftFrom(picked);
  };

  const scanDraft = () => scanDraftFrom(draft);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-xl border border-border/60 bg-surface-raised/80 p-5 backdrop-blur">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Elige la carpeta del vault</h2>
        <p className="text-xs text-muted-foreground">
          Es la carpeta que contiene <span className="font-mono">.obsidian</span>. Sólo se leen
          carpetas, nombres, tamaños y fechas: el contenido de los ficheros no se abre nunca.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <FolderOpenIcon aria-hidden className="size-4 text-muted-foreground" />
        <Input
          font="mono"
          size="sm"
          value={draft}
          placeholder="Ruta del vault"
          aria-label="Ruta del vault"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <Button size="sm" disabled={scanning} onClick={() => void scanDraft()}>
          {scanning ? <Spinner aria-hidden size="sm" /> : <ScanSearchIcon aria-hidden />}
          Escanear
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={scanning}
        onClick={() => void openFolderPicker()}
      >
        <FolderOpenIcon aria-hidden />
        {desktopBridge !== undefined ? "Explorar carpetas…" : "Explorar carpetas del servidor…"}
      </Button>

      <div ref={listingRef} className="flex min-h-24 flex-col gap-1 text-xs">
        {suggestions.isPending ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Spinner aria-hidden size="sm" />
            Leyendo carpetas
          </span>
        ) : suggestions.error ? (
          <span className="text-error">{suggestions.error}</span>
        ) : entries.length === 0 ? (
          <span className="text-muted-foreground">
            {parentPath === null
              ? "Escribe una ruta absoluta o usa el explorador."
              : "No hay subcarpetas. Puedes escanear esta ruta tal cual."}
          </span>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border/40">
            {entries.map((entry) => (
              <div key={entry.fullPath} className="flex items-stretch">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/60"
                  onClick={() => setDraft(withSeparator(entry.fullPath))}
                >
                  <FolderOpenIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">{entry.name}</span>
                </button>
                <button
                  type="button"
                  className="shrink-0 px-2 hover:bg-accent/60"
                  aria-label={`Escanear ${entry.name}`}
                  onClick={() => void scanDraftFrom(entry.fullPath)}
                >
                  <ScanSearchIcon aria-hidden className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {recents.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-3xs tracking-wide text-muted-foreground uppercase">Recientes</span>
          {recents.map((path) => (
            <button
              key={path}
              type="button"
              className="flex items-center gap-2 truncate rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-accent/60"
              onClick={() => void scanDraftFrom(path)}
            >
              <StarIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{path}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
