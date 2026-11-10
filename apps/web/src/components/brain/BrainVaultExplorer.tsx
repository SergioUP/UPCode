import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { buildVaultTree, type VaultTreeEntry } from "./brainVault";
import { fileColor, folderColor } from "./graphTheme";

function TreeRow(props: {
  readonly entry: VaultTreeEntry;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly onToggle: (id: string) => void;
  readonly onOpen: (id: string) => void;
}) {
  const { entry, expanded, selected } = props;
  const isFolder = entry.kind === "folder";
  const color = isFolder
    ? folderColor(entry.depth, true, entry.id)
    : fileColor(
        entry.id.split("/").slice(0, -1).join("/"),
        entry.id.split(".").at(-1),
        true,
        entry.id,
      );
  return (
    <button
      type="button"
      // Indentation is the tree's shape, so it is inline rather than a class.
      style={{ paddingLeft: `${String(8 + entry.depth * 12)}px` }}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-md py-1 pr-2 text-left text-xs transition-colors",
        selected ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white/90",
      )}
      onClick={() => (isFolder ? props.onToggle(entry.id) : props.onOpen(entry.id))}
      aria-expanded={isFolder ? expanded : undefined}
    >
      {isFolder ? (
        expanded ? (
          <ChevronDownIcon className="size-3 shrink-0 text-white/40" aria-hidden />
        ) : (
          <ChevronRightIcon className="size-3 shrink-0 text-white/40" aria-hidden />
        )
      ) : (
        <span className="size-3 shrink-0" aria-hidden />
      )}
      {isFolder ? (
        <FolderIcon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
      ) : (
        <FileTextIcon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
      )}
      <span className="min-w-0 truncate" style={isFolder ? { color } : undefined}>
        {entry.label}
      </span>
    </button>
  );
}

function TreeBranch(props: {
  readonly entries: ReadonlyArray<VaultTreeEntry>;
  readonly expanded: ReadonlySet<string>;
  readonly selectedId: string | null;
  readonly onToggle: (id: string) => void;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <>
      {props.entries.map((entry) => {
        const open = props.expanded.has(entry.id);
        return (
          <div key={entry.id}>
            <TreeRow
              entry={entry}
              expanded={open}
              selected={props.selectedId === entry.id}
              onToggle={props.onToggle}
              onOpen={props.onOpen}
            />
            {entry.kind === "folder" && open ? (
              <TreeBranch
                entries={entry.children}
                expanded={props.expanded}
                selectedId={props.selectedId}
                onToggle={props.onToggle}
                onOpen={props.onOpen}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** Folders the explorer opens on mount: the vault's own shape, two levels deep. */
function defaultExpanded(tree: ReadonlyArray<VaultTreeEntry>): Set<string> {
  const open = new Set<string>();
  const seed = (entries: ReadonlyArray<VaultTreeEntry>) => {
    for (const entry of entries) {
      if (entry.kind !== "folder" || entry.depth > 1) continue;
      open.add(entry.id);
      seed(entry.children);
    }
  };
  seed(tree);
  return open;
}

/**
 * The vault as a file tree beside the brain. The graph already carries every
 * path, so this needs no second request and can never disagree with the picture.
 */
export function BrainVaultExplorer(props: {
  readonly nodes: Parameters<typeof buildVaultTree>[0];
  readonly selectedId: string | null;
  readonly onOpen: (id: string) => void;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
}) {
  const tree = useMemo(() => buildVaultTree(props.nodes), [props.nodes]);
  // Seeded once per vault: the user's later toggles win over the default.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => defaultExpanded(tree));

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (props.collapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-white/10 bg-black/40 py-2">
        <button
          type="button"
          aria-label="Mostrar el árbol del vault"
          className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={props.onToggleCollapsed}
        >
          <ChevronRightIcon className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-black/40">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-2">
        <button
          type="button"
          aria-label="Ocultar el árbol del vault"
          className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          onClick={props.onToggleCollapsed}
        >
          <ChevronRightIcon className="size-3.5 rotate-180" aria-hidden />
        </button>
        <span className="text-2xs font-medium tracking-wide text-white/50 uppercase">Vault</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-2xs text-white/40">El vault está vacío.</p>
        ) : (
          <TreeBranch
            entries={tree}
            expanded={expanded}
            selectedId={props.selectedId}
            onToggle={toggle}
            onOpen={props.onOpen}
          />
        )}
      </div>
    </aside>
  );
}
