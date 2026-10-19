import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { ClipboardListIcon } from "lucide-react";

import { useEnvironmentQuery } from "../../state/query";
import { azureDevOps } from "../../state/azureDevOps";
import { useRightPanelStore } from "../../rightPanelStore";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { THREAD_DETAILS_PANEL_LABEL_CLASS } from "./threadDetailsPanelStyles";

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
  if (!link) return null;
  return (
    <a
      href={workItemAzureUrl(link)}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Abrir work item #${link.workItemId} de ${link.project} en Azure DevOps`}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-2xs font-medium text-primary outline-none hover:bg-primary/25 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
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
  const openPanel = () => {
    const ref = scopeThreadRef(environmentId, threadId);
    const panels = useRightPanelStore.getState();
    panels.open(ref, "work-item");
    panels.setThreadPanelOpen(ref, "popover", false);
  };

  return (
    <ThreadDetailsControl panel part="row" onClick={openPanel}>
      <ClipboardListIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className={THREAD_DETAILS_PANEL_LABEL_CLASS}>Work item</span>
      <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-2xs font-medium text-primary">
        {link ? `#${link.workItemId}` : "Asignar"}
      </span>
    </ThreadDetailsControl>
  );
}
