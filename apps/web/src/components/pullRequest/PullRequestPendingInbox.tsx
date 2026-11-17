import type { EnvironmentId, PullRequestPendingEntry } from "@upcode/contracts";
import { ChevronDownIcon, ChevronRightIcon, MessageSquareIcon } from "lucide-react";
import { useState } from "react";

import { usePullRequestPending } from "~/state/pullRequests";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { pullRequestThreadStatusLabel } from "./pullRequestThreadStatus.logic";
import type { PullRequestRowTarget } from "./PullRequestRow";

/**
 * What is waiting on the viewer: their own open pull requests that still have conversations
 * nobody closed. Opening a row opens that pull request in the detail panel beside the list.
 */
export function PullRequestPendingInbox({
  environmentIds,
  onSelect,
}: {
  environmentIds: ReadonlyArray<EnvironmentId>;
  onSelect: (target: PullRequestRowTarget) => void;
}) {
  const { entries, isPending } = usePullRequestPending(
    environmentIds.map((environmentId) => ({ environmentId, input: {} })),
  );
  const [expanded, setExpanded] = useState(true);
  const total = entries.reduce((sum, { entry }) => sum + entry.unresolvedCount, 0);
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section aria-label="Pending conversations" className="rounded-lg border border-border/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <Chevron className="size-4 text-muted-foreground" />
        <span className="font-medium">Pending conversations</span>
        {total > 0 ? <Badge variant="warning">{total}</Badge> : null}
      </button>
      {expanded ? (
        entries.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground">
            {isPending ? "Checking your pull requests..." : "Nothing is waiting on you."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {entries.map(({ environmentId, entry }) => (
              <PendingRow
                key={`${environmentId}:${entry.pullRequest.projectId}:${entry.pullRequest.host}:${entry.pullRequest.repository}#${entry.pullRequest.number}`}
                environmentId={environmentId}
                entry={entry}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}

function PendingRow({
  environmentId,
  entry,
  onSelect,
}: {
  environmentId: EnvironmentId;
  entry: PullRequestPendingEntry;
  onSelect: (target: PullRequestRowTarget) => void;
}) {
  const { pullRequest } = entry;
  const open = () =>
    onSelect({
      environmentId,
      projectId: pullRequest.projectId,
      host: pullRequest.host,
      repository: pullRequest.repository,
      number: pullRequest.number,
    });
  return (
    <li className="px-3 py-2">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={open}>
        <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{pullRequest.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {pullRequest.repository} #{pullRequest.number}
        </span>
        <Badge variant="warning">{entry.unresolvedCount}</Badge>
      </button>
      <ul className="mt-1 space-y-1 pl-5">
        {entry.threads.map((thread) => (
          <li key={thread.threadId}>
            <button
              type="button"
              className="flex w-full min-w-0 items-baseline gap-2 text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={open}
            >
              <Badge variant="outline" size="sm">
                {pullRequestThreadStatusLabel(thread.status)}
              </Badge>
              {thread.path === null ? null : (
                <span className="shrink-0 font-mono">
                  {thread.path}
                  {thread.line === null ? "" : `:${thread.line}`}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {thread.lastAuthor ? `${thread.lastAuthor.login}: ` : ""}
                {thread.preview}
              </span>
              <span className="shrink-0">{formatRelativeTimeLabel(thread.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}
