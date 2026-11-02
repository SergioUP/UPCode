import type { EnvironmentId, VcsRef } from "@t3tools/contracts";
import { ChevronDownIcon, GitBranchIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { usePaginatedBranches } from "../state/queries";
import { BranchPicker, BranchPickerRefItem } from "./BranchPicker";
import { sanitizeNewRefName } from "./BranchToolbar.logic";
import { Button } from "./ui/button";
import { ComboboxTrigger } from "./ui/combobox";
import { MiddleTruncate } from "./ui/middle-truncate";

/**
 * A change request targets a branch name, so remote refs are offered under their
 * bare name (`develop`, not `origin/develop`) and a local ref wins the dedupe.
 * A value held from elsewhere may still carry the remote prefix, which git
 * resolves just as well, so it is shown untouched when nothing matches it.
 */
function baseBranchItemName(ref: VcsRef): string {
  const remoteName = ref.remoteName;
  if (!ref.isRemote || !remoteName) return ref.name;
  const prefix = `${remoteName}/`;
  return ref.name.startsWith(prefix) ? ref.name.slice(prefix.length) : ref.name;
}

/**
 * Searchable target-branch picker for the create-change-request dialog.
 *
 * It is deliberately the same control the branch toolbar uses: a change request
 * points at a branch, and picking one should not look like a different job here
 * than it does there.
 */
export function PullRequestBaseBranchPicker({
  environmentId,
  cwd,
  value,
  onValueChange,
  excludeBranch,
  disabled = false,
  id,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string | null;
  readonly value: string | null;
  readonly onValueChange: (branch: string) => void;
  /** The branch the change request comes from; it cannot also be the target. */
  readonly excludeBranch: string | null;
  readonly disabled?: boolean;
  readonly id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const branches = usePaginatedBranches({
    environmentId,
    cwd,
    query: sanitizeNewRefName(deferredQuery),
  });

  const branchByName = useMemo(() => {
    const byName = new Map<string, VcsRef>();
    for (const ref of branches.refs) {
      const name = baseBranchItemName(ref);
      if (name === excludeBranch) continue;
      const existing = byName.get(name);
      if (existing === undefined || (existing.isRemote && !ref.isRemote)) {
        byName.set(name, ref);
      }
    }
    return byName;
  }, [branches.refs, excludeBranch]);

  const items = useMemo(() => [...branchByName.keys()], [branchByName]);
  // The default comes from the server's own base branch, which may not be on the
  // first page yet; it is shown anyway so the dialog never opens blank.
  const displayValue = useMemo(() => {
    if (value === null) return null;
    if (branchByName.has(value)) return value;
    const stripped = value.includes("/") ? value.slice(value.indexOf("/") + 1) : value;
    return branchByName.has(stripped) ? stripped : value;
  }, [branchByName, value]);
  const pickerItems = useMemo(
    () => (displayValue !== null && !items.includes(displayValue) ? [displayValue] : items),
    [displayValue, items],
  );

  const hasNextPage = branches.data?.nextCursor != null;
  const statusText =
    branches.error ??
    (branches.isPending && branches.data === null
      ? "Loading refs..."
      : branches.isFetchingNextPage
        ? "Loading more refs..."
        : hasNextPage
          ? `Showing ${branches.refs.length} of ${branches.data?.totalCount} refs`
          : null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };
  const select = (name: string) => {
    onValueChange(name);
    handleOpenChange(false);
  };

  return (
    <BranchPicker
      items={pickerItems}
      filteredItems={pickerItems}
      value={displayValue}
      query={query}
      resultsQuery={deferredQuery}
      onQueryChange={setQuery}
      open={open && !disabled}
      onOpenChange={handleOpenChange}
      onSelectItem={select}
      hasNextPage={hasNextPage}
      isFetchingNextPage={branches.isFetchingNextPage}
      onLoadNext={branches.loadNext}
      statusText={statusText}
      popupProps={{ align: "start", side: "bottom", className: "flex w-80 flex-col" }}
      renderItem={(name, index) => {
        const branch = branchByName.get(name);
        if (!branch) {
          // The preselected base branch, before its page of refs arrived.
          return (
            <BranchPickerRefItem
              branch={{
                name,
                current: false,
                isRemote: false,
                isDefault: false,
                worktreePath: null,
              }}
              projectCwd={cwd}
              index={index}
              onClick={() => select(name)}
            />
          );
        }
        return (
          <BranchPickerRefItem
            branch={branch}
            projectCwd={cwd}
            index={index}
            onClick={() => select(name)}
          />
        );
      }}
    >
      <ComboboxTrigger
        id={id}
        disabled={disabled || !cwd}
        render={<Button variant="outline" size="sm" />}
        className="w-full justify-between"
      >
        <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <MiddleTruncate
          value={displayValue ?? "Choose a base branch"}
          className="flex-1 text-left"
        />
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </ComboboxTrigger>
    </BranchPicker>
  );
}
