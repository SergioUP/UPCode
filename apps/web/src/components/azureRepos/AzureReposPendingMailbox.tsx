import type { EnvironmentId, PullRequestPendingEntry } from "@upcode/contracts";
import { useMemo } from "react";

import { usePullRequestPending } from "~/state/pullRequests";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Badge } from "../ui/badge";
import { pullRequestThreadStatusLabel } from "../pullRequest/pullRequestThreadStatus.logic";

export interface PendingMailboxTarget {
  readonly projectId: PullRequestPendingEntry["pullRequest"]["projectId"];
  readonly host: string;
  readonly repository: string;
  readonly number: number;
}

/**
 * Every conversation still open on the pull requests the viewer opened or was asked to review,
 * one row per conversation, newest first, like a mailbox. Opening a row opens its whole pull
 * request.
 */
export function AzureReposPendingMailbox({
  environmentId,
  onOpen,
}: {
  environmentId: EnvironmentId;
  onOpen: (target: PendingMailboxTarget) => void;
}) {
  const { entries, isPending } = usePullRequestPending([{ environmentId, input: {} }]);
  const messages = useMemo(
    () =>
      entries
        .flatMap(({ entry }) =>
          entry.threads.map((thread) => ({ pullRequest: entry.pullRequest, thread })),
        )
        .toSorted((left, right) => right.thread.updatedAt.localeCompare(left.thread.updatedAt)),
    [entries],
  );
  if (messages.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        {isPending ? "Buscando comentarios pendientes…" : "No tienes comentarios pendientes."}
      </p>
    );
  }
  return (
    <section aria-label="Comentarios pendientes" className="rounded-xl border bg-card/80 shadow-sm">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Pendiente</h2>
        <Badge variant="warning">{messages.length}</Badge>
      </header>
      <ul className="divide-y divide-border/60">
        {messages.map(({ pullRequest, thread }) => (
          <li
            key={`${pullRequest.projectId}:${pullRequest.repository}#${pullRequest.number}:${thread.threadId}`}
          >
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() =>
                onOpen({
                  projectId: pullRequest.projectId,
                  host: pullRequest.host,
                  repository: pullRequest.repository,
                  number: pullRequest.number,
                })
              }
            >
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="shrink-0 text-sm font-semibold">
                    {thread.lastAuthor?.name ?? thread.lastAuthor?.login ?? "Alguien"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{pullRequest.title}</span>
                  <time
                    dateTime={thread.updatedAt}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatRelativeTimeLabel(thread.updatedAt)}
                  </time>
                </span>
                <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                  {thread.preview}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" size="sm">
                    {pullRequestThreadStatusLabel(thread.status)}
                  </Badge>
                  <span className="truncate">
                    {pullRequest.repository} #{pullRequest.number}
                    {thread.path === null
                      ? ""
                      : ` · ${thread.path}${thread.line === null ? "" : `:${thread.line}`}`}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
