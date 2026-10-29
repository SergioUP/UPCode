import type { AzureDevOpsIdentity, EnvironmentId } from "@t3tools/contracts";
import { ClipboardListIcon, SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { azureDevOps } from "../../state/azureDevOps";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { toastManager } from "../ui/toast";
import { azureWorkItemFailureNotice } from "./azureWorkItemNotice";
import { AzureDevOpsPeopleChips, AzureDevOpsPeoplePicker } from "./AzureDevOpsPeoplePicker";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LABEL_CLASS,
} from "./threadDetailsPanelStyles";
import { WORK_ITEM_BLUE } from "./workItemVisuals";

/**
 * What a pull request carries beyond its own fields, at the place the thread shows
 * its branch: its work items and its reviewers.
 *
 * Only Azure DevOps pull requests get this. Nothing here reads anything until the
 * checkout's status says the thread's pull request is one, so a GitHub thread pays
 * nothing for it.
 */
export function ThreadPullRequestExtras({
  environmentId,
  gitCwd,
}: {
  readonly environmentId: EnvironmentId;
  readonly gitCwd: string;
}) {
  const status = useEnvironmentQuery(
    vcsEnvironment.status({ environmentId, input: { cwd: gitCwd } }),
  );
  const pullRequestUrl = status.data?.pr?.url ?? null;
  if (status.data?.sourceControlProvider?.kind !== "azure-devops" || !pullRequestUrl) return null;
  return (
    <ThreadPullRequestExtrasBody environmentId={environmentId} pullRequestUrl={pullRequestUrl} />
  );
}

function ThreadPullRequestExtrasBody({
  environmentId,
  pullRequestUrl,
}: {
  readonly environmentId: EnvironmentId;
  readonly pullRequestUrl: string;
}) {
  const extras = useEnvironmentQuery(
    azureDevOps.pullRequestExtras({ environmentId, input: { pullRequestUrl } }),
  );
  const update = useAtomCommand(azureDevOps.updatePullRequestExtras, { reportFailure: false });
  const [pending, setPending] = useState(false);
  const linkedWorkItemIds = extras.data?.linkedWorkItemIds ?? [];
  const reviewers = extras.data?.reviewers ?? [];

  const apply = async (patch: {
    workItem?: { id: number; linked: boolean };
    reviewer?: { id: string; requested: boolean };
  }) => {
    if (pending) return;
    setPending(true);
    const result = await update({ environmentId, input: { pullRequestUrl, ...patch } });
    setPending(false);
    if (result._tag !== "Success") {
      toastManager.add({
        type: "error",
        title: "La pull request no aceptó el cambio",
        description: azureWorkItemFailureNotice(squashAtomCommandFailure(result)),
      });
      return;
    }
    extras.refresh();
  };

  return (
    <ThreadDetailsSection
      headingId="thread-details-pull-request-heading"
      title="Pull request"
      showHeading={false}
      separated
    >
      <div className="flex flex-col">
        <div className="flex h-8 min-w-0 items-center gap-2.5 px-2.5">
          <ClipboardListIcon
            aria-hidden
            className={THREAD_DETAILS_PANEL_ICON_CLASS}
            style={{ color: WORK_ITEM_BLUE }}
          />
          <span className={THREAD_DETAILS_PANEL_LABEL_CLASS}>Work items</span>
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            {linkedWorkItemIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 ps-2 pe-0.5 text-2xs font-medium"
                style={{ color: WORK_ITEM_BLUE }}
              >
                #{id}
                <Button
                  type="button"
                  size="icon-tiny"
                  variant="ghost-muted"
                  aria-label={`Desenlazar el work item #${id}`}
                  disabled={pending}
                  onClick={() => void apply({ workItem: { id, linked: false } })}
                >
                  <XIcon aria-hidden />
                </Button>
              </span>
            ))}
            <ThreadPullRequestWorkItemPicker
              environmentId={environmentId}
              linkedWorkItemIds={linkedWorkItemIds}
              disabled={pending || extras.data === null}
              onPick={(id) => void apply({ workItem: { id, linked: true } })}
            />
          </div>
        </div>

        <div className="flex h-8 min-w-0 items-center gap-2.5 px-2.5">
          <UserPlusIcon aria-hidden className={THREAD_DETAILS_PANEL_ICON_CLASS} />
          <span className={THREAD_DETAILS_PANEL_LABEL_CLASS}>Reviewers</span>
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
            <AzureDevOpsPeopleChips
              people={reviewers.map((reviewer) => ({
                id: reviewer.id,
                displayName: reviewer.displayName,
                email: reviewer.uniqueName,
              }))}
              disabled={pending}
              onRemove={(id) => void apply({ reviewer: { id, requested: false } })}
            />
            <AzureDevOpsPeoplePicker
              environmentId={environmentId}
              label="Añadir"
              selectedIds={reviewers.map((reviewer) => reviewer.id)}
              disabled={pending || extras.data === null}
              onPick={(person: AzureDevOpsIdentity) =>
                void apply({ reviewer: { id: person.id, requested: true } })
              }
            />
          </div>
        </div>
        {extras.error !== null ? (
          <p className="px-2.5 pb-1 text-xs text-muted-foreground">{extras.error}</p>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}

/**
 * The work items assigned to you, narrowed here: the list is small enough that the
 * server is asked once, when the menu opens, and the filter runs on what arrived.
 */
function ThreadPullRequestWorkItemPicker({
  environmentId,
  linkedWorkItemIds,
  disabled,
  onPick,
}: {
  readonly environmentId: EnvironmentId;
  readonly linkedWorkItemIds: ReadonlyArray<number>;
  readonly disabled: boolean;
  readonly onPick: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const mine = useEnvironmentQuery(
    open ? azureDevOps.myWorkItems({ environmentId, input: {} }) : null,
  );
  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (mine.data ?? [])
      .filter((item) => !linkedWorkItemIds.includes(item.id))
      .filter(
        (item) =>
          needle.length === 0 ||
          String(item.id).includes(needle) ||
          item.title.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [linkedWorkItemIds, mine.data, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={<Button type="button" size="compact" variant="ghost-muted" />}
        aria-label="Enlazar un work item"
        disabled={disabled}
      >
        <ClipboardListIcon aria-hidden />
        Enlazar
      </PopoverTrigger>
      <PopoverPopup align="end" side="bottom" width="md">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            size="sm"
            aria-label="Buscar en tus work items"
            placeholder="#ID o título"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </InputGroup>
        {mine.error !== null ? (
          <p className="mt-2 text-xs text-muted-foreground">{mine.error}</p>
        ) : mine.isPending && mine.data === null ? (
          <p className="mt-2 text-xs text-muted-foreground">Leyendo tus tareas…</p>
        ) : candidates.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {query.trim() ? "Nada coincide." : "No tienes tareas sin enlazar."}
          </p>
        ) : (
          <ScrollArea className="mt-2 max-h-64">
            <ul className="flex flex-col gap-0.5">
              {candidates.map((item) => (
                <li key={`${item.project}#${item.id}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    className="w-full justify-start"
                    onClick={() => {
                      onPick(item.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="shrink-0 font-semibold" style={{ color: WORK_ITEM_BLUE }}>
                      #{item.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{item.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverPopup>
    </Popover>
  );
}
