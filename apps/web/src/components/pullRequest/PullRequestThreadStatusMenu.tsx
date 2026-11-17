import type {
  PullRequestRef,
  PullRequestReviewThread,
  PullRequestThreadStatus,
  EnvironmentId,
} from "@upcode/contracts";
import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "../ui/menu";
import {
  pullRequestThreadDisplayStatus,
  pullRequestThreadStatusLabel,
} from "./pullRequestThreadStatus.logic";

/**
 * Moves a conversation between the states its host has, for a host with more than
 * resolved/unresolved. The current state is the trigger's label, so it is also how the state reads.
 */
export function PullRequestThreadStatusMenu({
  status,
  statuses,
  disabled,
  onSelect,
}: {
  status: PullRequestThreadStatus;
  statuses: ReadonlyArray<PullRequestThreadStatus>;
  disabled: boolean;
  onSelect: (status: PullRequestThreadStatus) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="xs" variant="ghost" disabled={disabled}>
            {pullRequestThreadStatusLabel(status)}
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuRadioGroup
          value={status}
          onValueChange={(next) => {
            if (next !== status) onSelect(next as PullRequestThreadStatus);
          }}
        >
          {statuses.map((option) => (
            <MenuRadioItem key={option} value={option}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {pullRequestThreadStatusLabel(option)}
                </span>
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/**
 * A thread's state outside the diff, where the summary lists its remarks. The menu appears only
 * where the host has several states and the viewer may change them; otherwise the state is text.
 */
export function PullRequestThreadStatusControl({
  thread,
  statuses,
  canResolve,
  environmentId,
  reference,
  onRefresh,
}: {
  thread: PullRequestReviewThread;
  statuses: ReadonlyArray<PullRequestThreadStatus> | undefined;
  canResolve: boolean;
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  onRefresh: () => void;
}) {
  const setThreadResolution = useAtomCommand(pullRequestEnvironment.setThreadResolution, {
    reportFailure: false,
  });
  const [saving, setSaving] = useState(false);
  const status = pullRequestThreadDisplayStatus(thread);
  if (!canResolve || statuses === undefined) {
    return thread.status === undefined ? null : (
      <span className="text-xs text-muted-foreground">{pullRequestThreadStatusLabel(status)}</span>
    );
  }
  return (
    <PullRequestThreadStatusMenu
      status={status}
      statuses={statuses}
      disabled={saving}
      onSelect={async (next) => {
        setSaving(true);
        const result = await setThreadResolution({
          environmentId,
          input: { ...reference, threadId: thread.id, resolved: next === "fixed", status: next },
        });
        setSaving(false);
        if (result._tag === "Failure") {
          toastManager.add({ type: "error", title: "The conversation could not be updated" });
          return;
        }
        onRefresh();
      }}
    />
  );
}
