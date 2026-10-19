import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { ClipboardListIcon } from "lucide-react";

import { useEnvironmentQuery } from "../../state/query";
import { azureDevOps } from "../../state/azureDevOps";
import { useRightPanelStore } from "../../rightPanelStore";
import { inkOn, stateVeil } from "../issues/issueVisuals";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { THREAD_DETAILS_PANEL_LABEL_CLASS } from "./threadDetailsPanelStyles";
import { useWorkItemStateVisual, WORK_ITEM_BLUE } from "./workItemVisuals";

export function workItemAzureUrl(link: {
  readonly organization: string;
  readonly project: string;
  readonly workItemId: number;
}): string {
  return `https://dev.azure.com/${encodeURIComponent(link.organization)}/${encodeURIComponent(link.project)}/_workitems/edit/${link.workItemId}`;
}

/** The assigned work item on a thread card. Clicking opens that item in Azure DevOps. */
export function ThreadWorkItemLink({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const links = useEnvironmentQuery(azureDevOps.threadLinks({ environmentId, input: {} }));
  const link = links.data?.[threadId];
  const visual = useWorkItemStateVisual(environmentId, link);
  if (!link) return null;
  // The number wears the colour Azure gives the state, the way the board does.
  const accent = visual.hex ?? WORK_ITEM_BLUE;
  return (
    <a
      href={workItemAzureUrl(link)}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Abrir work item #${link.workItemId} de ${link.project} en Azure DevOps`}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      style={{ backgroundColor: accent, color: inkOn(accent) }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <ClipboardListIcon aria-hidden className="size-3" />#{link.workItemId}
    </a>
  );
}

export function ThreadWorkItemControl({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const links = useEnvironmentQuery(azureDevOps.threadLinks({ environmentId, input: {} }));
  const link = links.data?.[threadId];
  const visual = useWorkItemStateVisual(environmentId, link);
  const openPanel = () => {
    const ref = scopeThreadRef(environmentId, threadId);
    const panels = useRightPanelStore.getState();
    panels.open(ref, "work-item");
    panels.setThreadPanelOpen(ref, "popover", false);
  };

  return (
    <ThreadDetailsControl panel part="row" onClick={openPanel}>
      <ClipboardListIcon
        aria-hidden="true"
        className="size-4 shrink-0"
        style={{ color: WORK_ITEM_BLUE }}
      />
      <span className={THREAD_DETAILS_PANEL_LABEL_CLASS} style={{ color: WORK_ITEM_BLUE }}>
        Work item
      </span>
      {link ? (
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-2xs font-semibold"
          style={{
            backgroundColor: visual.hex ?? WORK_ITEM_BLUE,
            color: inkOn(visual.hex ?? WORK_ITEM_BLUE),
          }}
        >
          #{link.workItemId}
        </span>
      ) : (
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-2xs font-medium"
          style={{ backgroundColor: stateVeil(WORK_ITEM_BLUE, 18), color: WORK_ITEM_BLUE }}
        >
          Asignar
        </span>
      )}
    </ThreadDetailsControl>
  );
}
