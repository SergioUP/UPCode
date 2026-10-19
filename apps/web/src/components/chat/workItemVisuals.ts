import type { AzureDevOpsWorkItemLink, EnvironmentId } from "@t3tools/contracts";

import { azureDevOps } from "../../state/azureDevOps";
import { useEnvironmentQuery } from "../../state/query";
import { stateHex } from "../issues/issueVisuals";

/**
 * Azure DevOps' own blue. A work item is the one thing in a thread that points
 * at ADO, so it wears ADO's colour instead of the app accent: in the panel row,
 * on the thread card and in the work-item sheet.
 */
export const WORK_ITEM_BLUE = "#4c9aff";

export type WorkItemStateVisual = {
  /** The state ADO reports right now, or null while it is unknown. */
  readonly state: string | null;
  /** The colour the project's process gives that state, with the leading `#`. */
  readonly hex: string | null;
};

const EMPTY: WorkItemStateVisual = { state: null, hex: null };

/**
 * The state of a linked work item, coloured the way Azure colours it.
 *
 * It reads the very same query the side panel reads, so it costs no extra call
 * once the panel has been opened, and editing the state there repaints the badge
 * without a second refresh path. While ADO has not answered — or cannot be
 * reached — the callers fall back to `WORK_ITEM_BLUE`.
 */
export function useWorkItemStateVisual(
  environmentId: EnvironmentId,
  link: AzureDevOpsWorkItemLink | undefined,
): WorkItemStateVisual {
  const config = useEnvironmentQuery(
    link ? azureDevOps.config({ environmentId, input: {} }) : null,
  );
  const item = useEnvironmentQuery(
    link && config.data?.connected === true
      ? azureDevOps.workItem({
          environmentId,
          input: { project: link.project, id: link.workItemId },
        })
      : null,
  );
  const state = item.data?.state ?? null;
  if (!state) return EMPTY;
  const color = item.data?.states?.find((entry) => entry.name === state)?.color;
  return { state, hex: color ? stateHex(color) : null };
}
