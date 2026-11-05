"use client";

import type { VaultGraphSnapshot } from "@upcode/contracts";
import { squashAtomCommandFailure } from "@upcode/client-runtime/state/runtime";
import {
  ArrowLeftIcon,
  BrainIcon,
  OrbitIcon,
  PauseIcon,
  RadarIcon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrimaryEnvironmentId } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { vaultGraph } from "../../state/vaultGraph";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { BrainNoteReader } from "./BrainNoteReader";
import { BrainScene, type BrainGraphNode, type BrainLink } from "./BrainScene";
import { BrainVaultExplorer } from "./BrainVaultExplorer";
import { clusterHue, fileColor, folderColor, folderClusterKey, nodeColorCss } from "./graphTheme";
import { VaultPicker, type VaultRootKind } from "./VaultPicker";

const VAULT_STORAGE_KEY = "upcode:brain:vault";
const VAULT_KIND_STORAGE_KEY = "upcode:brain:vaultKind";
const RECENTS_STORAGE_KEY = "upcode:brain:recentVaults";
const RECENTS_LIMIT = 5;
/** How often a loaded vault is asked whether it changed. */
const VAULT_POLL_INTERVAL_MS = 15_000;
/**
 * Past this many nodes the labels and the moving particles stop being readable
 * and start being expensive, so the scene drops to structure alone. It is a
 * property of the size, not of any particular vault.
 */
const DETAILED_NODE_LIMIT = 1500;

function readRecentVaults(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function rememberVault(vaultPath: string): string[] {
  const next = [vaultPath, ...readRecentVaults().filter((path) => path !== vaultPath)].slice(
    0,
    RECENTS_LIMIT,
  );
  localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "hace 2 min" sin dependencias de fechas: el cerebro sÃ³lo necesita una pista. */
function relativeTime(epochMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (seconds < 45) return "ahora mismo";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `hace ${hours} h`;
}

function failureMessage(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "No se pudo leer el vault.";
}

/**
 * El cerebro del vault.
 *
 * The screen owns the vault, the graph the server answered with, and what the
 * reader is pointing at. The simulation and the camera belong to
 * `react-force-graph-3d` (see `BrainScene`), and the layout survives a rescan
 * because the node objects are reused: the simulation keeps their positions and
 * only the new notes start from zero.
 */
export function BrainPage() {
  const environmentId = usePrimaryEnvironmentId();
  const navigateToMainApp = useNavigateToMainApp();
  const scan = useAtomCommand(vaultGraph.scan, { reportFailure: false });

  const [vaultPath, setVaultPath] = useState<string | null>(() =>
    localStorage.getItem(VAULT_STORAGE_KEY),
  );
  const [recents, setRecents] = useState<string[]>(readRecentVaults);
  const [snapshot, setSnapshot] = useState<VaultGraphSnapshot | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The note open in the reader panel; the selected node lights up in the brain. */
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [clusterFilter, setClusterFilter] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [following, setFollowing] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  /**
   * Whether the chosen folder is an Obsidian vault root (it holds `.obsidian`).
   * A plain folder is plotted all the same; this only tells the reader which
   * one they picked. It is remembered next to the path so reopening the screen
   * does not have to check again.
   */
  const [vaultRootKind, setVaultRootKind] = useState<VaultRootKind | null>(() => {
    const stored = localStorage.getItem(VAULT_KIND_STORAGE_KEY);
    if (stored === null) return null;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (typeof parsed !== "object" || parsed === null) return null;
      const { path, kind } = parsed as { path?: unknown; kind?: unknown };
      if (path !== localStorage.getItem(VAULT_STORAGE_KEY)) return null;
      return kind === "obsidian" || kind === "plain" ? kind : null;
    } catch {
      return null;
    }
  });
  /**
   * Node objects, one per entry. `react-force-graph-3d` writes the simulated
   * position into the object it is given, so reusing them across scans is
   * exactly what keeps a growing vault from rearranging itself.
   */
  const [nodes, setNodes] = useState<BrainGraphNode[]>([]);
  const scanToken = useRef(0);
  const bootstrapped = useRef(false);
  /** The graph on screen, read by the poll that decides whether to replace it. */
  const current = useRef<VaultGraphSnapshot | null>(null);

  const runScan = useCallback(
    async (requestedPath: string) => {
      if (!environmentId) return;
      const token = ++scanToken.current;
      setScanning(true);
      setError(null);
      const result = await scan({
        environmentId,
        input: { vaultPath: requestedPath },
      });
      if (token !== scanToken.current) return;
      setScanning(false);
      if (result._tag !== "Success") {
        setError(failureMessage(squashAtomCommandFailure(result)));
        return;
      }
      const graphSnapshot = result.value;
      if (current.current?.vaultPath !== graphSnapshot.vaultPath) {
        // A different vault starts from nothing: reusing positions across vaults
        // would draw one vault's shape with another vault's notes.
        setNodes([]);
        setSelectedId(null);
        setClusterFilter(null);
      }
      current.current = graphSnapshot;
      setSnapshot(graphSnapshot);
      setLastSyncAt(Date.now());
      setVaultPath(graphSnapshot.vaultPath);
      localStorage.setItem(VAULT_STORAGE_KEY, graphSnapshot.vaultPath);
      setRecents(rememberVault(graphSnapshot.vaultPath));
    },
    [environmentId, scan],
  );

  // Reopening the screen goes straight back to the vault you were reading.
  useEffect(() => {
    if (bootstrapped.current || vaultPath === null) return;
    bootstrapped.current = true;
    void runScan(vaultPath);
  }, [runScan, vaultPath]);

  /**
   * A vault keeps growing while the screen is open. Re-reading every note on a
   * timer would be wasteful, so the server is asked for a fingerprint of the
   * files first; only when it moved is the graph fetched again. Polling stops
   * while the tab is hidden.
   */
  useEffect(() => {
    if (environmentId === null || !following || snapshot === null) return;
    const watchedPath = snapshot.vaultPath;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await scan({
        environmentId,
        input: { vaultPath: watchedPath, probe: true },
      });
      if (cancelled || result._tag !== "Success") return;
      const previous = current.current;
      if (previous === null || previous.vaultPath !== watchedPath) return;
      if (result.value.fingerprint !== previous.fingerprint) void runScan(watchedPath);
    };
    const timer = setInterval(() => void check(), VAULT_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [environmentId, following, runScan, scan, snapshot]);

  /**
   * Nodes keep their identity and their simulated position between scans.
   *
   * This is deliberately a state write inside an effect: the objects are owned
   * by the simulation (it writes x/y/z/vx into them), so they cannot be derived
   * during render without sharing mutable state between renders.
   */
  useEffect(() => {
    if (snapshot === null) {
      setNodes([]);
      return;
    }
    setNodes((previous) => {
      const byId = new Map(previous.map((node) => [node.id, node]));
      const next: BrainGraphNode[] = [];
      for (const node of snapshot.nodes) {
        const cached = byId.get(node.id);
        if (cached !== undefined) {
          // Position and velocity live on this object; only the description moves.
          Object.assign(cached, node);
          next.push(cached);
          continue;
        }
        next.push({ ...node });
      }
      return next;
    });
  }, [snapshot]);

  const links = useMemo<BrainLink[]>(
    () => (snapshot === null ? [] : snapshot.links.map((link) => ({ ...link }))),
    [snapshot],
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const neighboursById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of links) {
      const forward = map.get(link.source);
      if (forward === undefined) map.set(link.source, [link.target]);
      else forward.push(link.target);
      const backward = map.get(link.target);
      if (backward === undefined) map.set(link.target, [link.source]);
      else backward.push(link.source);
    }
    return map;
  }, [links]);

  // Null means "no filter": every node keeps its colour.
  const highlightedIds = useMemo<ReadonlySet<string> | null>(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0 && clusterFilter === null) return null;
    const matches = new Set<string>();
    for (const node of nodes) {
      if (clusterFilter !== null && folderClusterKey(node.folder) !== clusterFilter) continue;
      if (
        needle.length > 0 &&
        !node.label.toLowerCase().includes(needle) &&
        !node.id.toLowerCase().includes(needle)
      ) {
        continue;
      }
      matches.add(node.id);
    }
    return matches;
  }, [nodes, query, clusterFilter]);

  /**
   * The legend follows the colour: dots are painted by top-level folder, so the
   * legend lists the folders that actually exist, biggest first.
   */
  const clusters = useMemo(() => {
    if (snapshot === null) return [];
    const counts = new Map<string, number>();
    for (const node of snapshot.nodes) {
      if (node.kind !== "file") continue;
      const key = folderClusterKey(node.folder);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([cluster, count]) => ({ cluster, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10);
  }, [snapshot]);

  const selectedNode = selectedId === null ? null : (nodeById.get(selectedId) ?? null);
  const hoveredNode = hoveredId === null ? null : (nodeById.get(hoveredId) ?? null);

  const selectedNeighbours = useMemo(() => {
    if (selectedId === null) return [];
    const ids = [...new Set(neighboursById.get(selectedId) ?? [])];
    return ids
      .map((id) => nodeById.get(id))
      .filter((node): node is BrainGraphNode => node !== undefined)
      .sort((left, right) => right.degree - left.degree)
      .slice(0, 12);
  }, [selectedId, neighboursById, nodeById]);

  const clearVault = () => {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    localStorage.removeItem(VAULT_KIND_STORAGE_KEY);
    current.current = null;
    setNodes([]);
    setVaultPath(null);
    setVaultRootKind(null);
    setSnapshot(null);
    setSelectedId(null);
    setLastSyncAt(null);
    setError(null);
  };

  return (
    // Full-bleed route: the app sidebar is hidden, so the vault tree can sit
    // where Obsidian puts it and the brain keeps the rest.
    <div
      className="flex h-dvh min-h-0 w-full flex-row overflow-hidden"
      style={{ background: "#05070d" }}
    >
      {snapshot !== null ? (
        <BrainVaultExplorer
          nodes={snapshot.nodes}
          selectedId={selectedId}
          onOpen={(id) => {
            setSelectedId(id);
            setOpenNoteId(id);
          }}
          collapsed={explorerCollapsed}
          onToggleCollapsed={() => setExplorerCollapsed((value) => !value)}
        />
      ) : null}
      <div className="relative min-w-0 flex-1">
        {snapshot !== null ? (
          <div className="absolute inset-0">
            <BrainScene
              nodes={nodes}
              links={links}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              detailed={nodes.length <= DETAILED_NODE_LIMIT}
              autoRotate={autoRotate}
              onSelect={setSelectedId}
              onHover={setHoveredId}
            />
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Volver" onClick={navigateToMainApp}>
              <ArrowLeftIcon />
            </Button>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
              <BrainIcon className="size-4" aria-hidden />
              Cerebro
            </span>
          </div>
          <div className="pointer-events-auto max-w-96 min-w-48 flex-1 rounded-md bg-black/50">
            <Input
              font="mono"
              size="sm"
              value={query}
              placeholder="Buscar nota o etiqueta"
              aria-label="Buscar en el grafo"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <Button
              variant={following ? "default" : "ghost"}
              size="icon-sm"
              aria-label={following ? "Dejar de vigilar el vault" : "Vigilar el vault"}
              onClick={() => setFollowing((value) => !value)}
            >
              <RadarIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={autoRotate ? "Parar la rotaciÃ³n" : "Girar automÃ¡ticamente"}
              onClick={() => setAutoRotate((value) => !value)}
            >
              {autoRotate ? <PauseIcon /> : <OrbitIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Volver a escanear"
              disabled={snapshot === null || scanning}
              onClick={() => {
                if (snapshot !== null) void runScan(snapshot.vaultPath);
              }}
            >
              <RefreshCwIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cambiar de vault"
              onClick={clearVault}
            >
              <XIcon />
            </Button>
          </div>
        </div>

        {snapshot === null ? (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            {environmentId === null ? (
              <p className="text-sm text-white/70">Conecta un entorno para leer el vault.</p>
            ) : (
              <VaultPicker
                environmentId={environmentId}
                recents={recents}
                scanning={scanning}
                onPick={(path, kind) => {
                  setVaultRootKind(kind);
                  localStorage.setItem(VAULT_KIND_STORAGE_KEY, JSON.stringify({ path, kind }));
                  void runScan(path);
                }}
              />
            )}
          </div>
        ) : null}

        {scanning && snapshot !== null ? (
          <div className="absolute inset-x-0 top-16 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
              <Spinner aria-hidden size="sm" />
              Releyendo el vault
            </span>
          </div>
        ) : null}

        {error !== null ? (
          <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
            <p className="rounded-lg border border-error/40 bg-black/70 px-3 py-2 text-xs text-error">
              {error}
            </p>
          </div>
        ) : null}

        {hoveredNode !== null && hoveredNode.id !== selectedId ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
            <span className="rounded-full border border-white/10 bg-black/70 px-3 py-1 text-2xs text-white/85">
              {hoveredNode.label}
              {hoveredNode.extension !== undefined ? (
                <span className="ml-1.5 text-white/40">.{hoveredNode.extension}</span>
              ) : null}
            </span>
          </div>
        ) : null}

        {snapshot !== null ? (
          <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-72 flex-col gap-2 text-2xs text-white/60">
            <div className="pointer-events-auto flex flex-col gap-1">
              <span className="truncate font-mono text-white/40">{snapshot.vaultPath}</span>
              <span className="flex items-center gap-1.5 text-3xs">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ background: vaultRootKind === "obsidian" ? "#69c98a" : "#6b7280" }}
                />
                {vaultRootKind === "obsidian"
                  ? "raÃ­z de vault de Obsidian (.obsidian)"
                  : vaultRootKind === "plain"
                    ? "carpeta sin .obsidian: se dibuja igual"
                    : "raÃ­z sin comprobar"}
              </span>
              <span>
                {snapshot.fileCount} ficheros Â· {snapshot.folderCount} carpetas Â·{" "}
                {snapshot.sameNameLinkCount} nombres repetidos Â· {snapshot.durationMs} ms
              </span>
              <span className="text-white/35">
                {following ? "Vigilando el vault" : "Vigilancia desactivada"}
                {lastSyncAt === null ? "" : ` Â· leÃ­do ${relativeTime(lastSyncAt)}`}
              </span>
              {snapshot.truncated ? (
                <span className="text-warning">
                  Vault recortado: sube el lÃ­mite para verlo entero.
                </span>
              ) : null}
            </div>
            <div className="pointer-events-auto flex flex-wrap gap-1">
              {clusters.map((entry) => {
                const active = clusterFilter === entry.cluster;
                return (
                  <button
                    key={entry.cluster}
                    type="button"
                    onClick={() => setClusterFilter(active ? null : entry.cluster)}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 hover:border-white/40"
                    style={{ opacity: clusterFilter === null || active ? 1 : 0.4 }}
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: fileColor(entry.cluster, "md") }}
                    />
                    <span className="max-w-32 truncate">{entry.cluster}</span>
                    <span className="text-white/35">{entry.count}</span>
                  </button>
                );
              })}
              <span
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5"
                aria-label={`${snapshot.folderCount} carpetas`}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full border border-white/40"
                  style={{
                    background: folderColor(1, true),
                    boxShadow: `0 0 8px ${folderColor(1, true)}`,
                  }}
                />
                <span>carpetas</span>
                <span className="text-white/35">{snapshot.folderCount}</span>
              </span>
            </div>
          </div>
        ) : null}

        {selectedNode !== null && openNoteId === null ? (
          <div className="absolute top-16 right-3 z-20 flex w-72 flex-col gap-2 rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white/80 backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-white">
                  {selectedNode.label}
                </span>
                <span className="truncate font-mono text-3xs text-white/40">
                  {selectedNode.id}
                  {selectedNode.extension !== undefined ? ` Â· .${selectedNode.extension}` : ""}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-micro"
                aria-label="Cerrar ficha"
                onClick={() => setSelectedId(null)}
              >
                <XIcon />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 text-3xs">
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                {selectedNode.kind === "folder" ? "carpeta" : "fichero"}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                {selectedNode.degree} conexiones
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                nivel {selectedNode.depth}
              </span>
              {selectedNode.bytes > 0 ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5">
                  {formatBytes(selectedNode.bytes)}
                </span>
              ) : null}
            </div>
            {selectedNeighbours.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-3xs tracking-wide text-white/35 uppercase">
                  Conectado con
                </span>
                <div className="max-h-56 overflow-y-auto">
                  {selectedNeighbours.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      className="flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left hover:bg-white/10"
                      onClick={() => setSelectedId(node.id)}
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: nodeColorCss(node, true) }}
                      />
                      <span className="truncate">{node.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {query.trim().length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
            <span className="rounded-full bg-black/60 px-3 py-1 text-2xs text-white/60">
              <SearchIcon aria-hidden className="mr-1 inline size-3" />
              {query.trim()} resalta los ficheros que coinciden
            </span>
          </div>
        ) : null}
      </div>
      {snapshot !== null && openNoteId !== null ? (
        <BrainNoteReader
          environmentId={environmentId}
          vaultPath={snapshot.vaultPath}
          relativePath={openNoteId}
          onClose={() => setOpenNoteId(null)}
        />
      ) : null}
    </div>
  );
}
