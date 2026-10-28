import { useComposerMenuState } from "../chat/useComposerMenuState";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { useEnvironmentsWithScope, readEnvironmentScope } from "../../state/session";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/reactivity";
import { type EnvironmentId, type ProjectIconOverride } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { InfoIcon, Trash2Icon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import {
  deriveProjectGroupingOverrideKey,
  selectProjectGroupingSettings,
} from "../../logicalProject";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import {
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";
import { projectEnvironment } from "../../state/projects";
import { ProjectFavicon } from "../ProjectFavicon";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import {
  canPickExternalProjectFavicon,
  ProjectFaviconPickerDialog,
} from "./ProjectFaviconPickerDialog";
import { ProjectActionsSettings } from "./ProjectActionsSettings";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { projectGroupTitleNeedsUpdate } from "./ProjectSettingsPanel.logic";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";

const ProjectIconPickerDialog = lazy(() =>
  import("./ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

function memberKey(member: { environmentId: string; id: string }): string {
  return `${member.environmentId}:${member.id}`;
}

function ProjectFolderRow({
  member,
  disabled,
  onSave,
  onSeparate,
  separated,
  onRemove,
}: {
  readonly member: SidebarProjectGroupMember;
  readonly disabled: boolean;
  readonly onSave: (path: string) => void;
  readonly onSeparate: (() => void) | undefined;
  readonly separated: boolean;
  readonly onRemove: () => void;
}) {
  const [path, setPath] = useState(member.workspaceRoot);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const canBrowse =
    typeof window !== "undefined" &&
    !!window.desktopBridge &&
    member.environmentId === primaryEnvironmentId &&
    !(navigator.platform.toLowerCase().includes("win") && member.workspaceRoot.startsWith("/"));
  return (
    <SettingsRow
      title="Project folder"
      description={`${member.title} on ${member.environmentLabel ?? "this environment"}. Choose the Git checkout folder for branches and diffs.`}
      control={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            size="sm"
            className="w-full sm:w-64"
            aria-label={`Project folder on ${member.environmentLabel ?? "this environment"}`}
            value={path}
            disabled={disabled}
            onChange={(event) => setPath(event.target.value)}
          />
          {canBrowse ? (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                void window
                  .desktopBridge!.pickFolder({ initialPath: member.workspaceRoot })
                  .then((selected) => {
                    if (selected) setPath(selected);
                  })
                  .catch(() =>
                    toastManager.add({ type: "error", title: "Could not open folder picker" }),
                  );
              }}
            >
              Browse…
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !path.trim() || path.trim() === member.workspaceRoot}
            onClick={() => onSave(path)}
          >
            Save
          </Button>
          {onSeparate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onSeparate}
              aria-label={`${separated ? "Reset grouping for" : "Separate checkout"} ${member.workspaceRoot}`}
            >
              {separated ? "Use default grouping" : "Separate"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="destructive-outline"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remove checkout ${member.workspaceRoot}`}
          >
            <Trash2Icon />
            Remove
          </Button>
        </div>
      }
    />
  );
}

/** `project` is the Projects page shortcut: the new-thread defaults people change most. */
export type ProjectSettingsCategory = "general" | "integrations" | "source-control" | "project";

export function ProjectSettingsPanel({
  projectKey,
  environmentId = null,
  checkoutKey = null,
}: {
  projectKey: string;
  environmentId?: EnvironmentId | null;
  checkoutKey?: string | null;
}) {
  const groups = useSettingsProjectGroups();
  const navigate = useNavigate({ from: "/settings" });
  const pathname = useLocation({ select: (location) => location.pathname });

  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;
  const members = useMemo(
    () =>
      selected?.memberProjects.filter(
        (member) =>
          (environmentId === null || member.environmentId === environmentId) &&
          (checkoutKey === null || member.physicalProjectKey === checkoutKey),
      ) ?? [],
    [selected, environmentId, checkoutKey],
  );

  // Remember the members of the last rendered group so a grouping-rule change
  // (which changes the group key) can follow the project to its new group.
  const lastSelectionRef = useRef<{
    key: string;
    environmentId: EnvironmentId | null;
    checkoutKey: string | null;
    memberKeys: string[];
  } | null>(null);
  useEffect(() => {
    if (!selected || members.length === 0) return;
    lastSelectionRef.current = {
      key: selected.projectKey,
      environmentId,
      checkoutKey,
      memberKeys: members.map((member) => member.physicalProjectKey),
    };
  }, [selected, members, environmentId, checkoutKey]);

  // A grouping-rule change replaces the group key mid-visit; follow the
  // project to its new key instead of parking on the not-found state.
  useEffect(() => {
    if (members.length > 0) return;
    const last = lastSelectionRef.current;
    if (
      last?.key !== projectKey ||
      last.environmentId !== environmentId ||
      last.checkoutKey !== checkoutKey
    )
      return;
    const successor = groups.find((group) =>
      group.memberProjects.some((member) => last.memberKeys.includes(member.physicalProjectKey)),
    );
    if (successor) {
      void navigate({
        to: pathname,
        search: () => ({
          project: successor.projectKey,
          machine: environmentId ?? undefined,
          checkout: checkoutKey ?? undefined,
        }),
        replace: true,
        hashScrollIntoView: false,
      });
    }
  }, [groups, navigate, pathname, projectKey, members.length, environmentId, checkoutKey]);

  if (!selected) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {groups.length === 0
          ? "Add a project from the sidebar to configure it here."
          : "This project is no longer available."}
      </div>
    );
  }
  if (members.length === 0)
    return (
      <p className="p-8 text-sm text-muted-foreground">
        This checkout is no longer available in the selected project and environment.
      </p>
    );
  const scopedGroup = {
    ...selected,
    memberProjects: members,
    environmentId: members[0]!.environmentId,
    id: members[0]!.id,
  };
  return (
    <ProjectDetail
      key={`${selected.projectKey}:${environmentId ?? "all"}:${checkoutKey ?? "all"}`}
      group={scopedGroup}
      hasOtherMembers={members.length < selected.memberProjects.length}
    />
  );
}

function ProjectDetail({
  group,
  hasOtherMembers,
}: {
  group: SidebarProjectSnapshot;
  hasOtherMembers: boolean;
}) {
  const navigate = useNavigate({ from: "/settings" });
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const editableIds = useEnvironmentsWithScope(group.memberProjects, AuthOrchestrationOperateScope);
  const canEditGroup = group.memberProjects.every((member) =>
    editableIds.has(member.environmentId),
  );
  const representative =
    group.memberProjects.find(
      (member) => environmentById.get(member.environmentId)?.serverConfig != null,
    ) ?? group.memberProjects[0]!;
  const threads = useThreadShells();
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const updateClientSettings = useUpdateClientSettings();
  const updateProject = useOrchestrationCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: false,
  });
  const projectNameEditedRef = useRef(false);

  const faviconPath = representative.faviconPath ?? null;
  const projectIcon = representative.projectIcon ?? null;
  const pickProjectFavicon =
    typeof window !== "undefined" &&
    group.memberProjects.every(
      (member) =>
        member.environmentId === primaryEnvironmentId &&
        canPickExternalProjectFavicon(member.workspaceRoot, navigator.platform),
    )
      ? window.desktopBridge?.pickProjectFavicon
      : undefined;

  const reportFailure = useCallback((title: string, result: AtomCommandResult<void, unknown>) => {
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title,
        description: error instanceof Error ? error.message : "An error occurred.",
      }),
    );
  }, []);

  const checkProjectAccess = useCallback(
    (members: ReadonlyArray<SidebarProjectGroupMember>, failureTitle: string) => {
      const denied = members.find(
        (member) => !readEnvironmentScope(member.environmentId, AuthOrchestrationOperateScope),
      );
      if (!denied) return null;
      const result = AsyncResult.failure<void, Error>(
        Cause.fail(
          new Error(
            `This connection cannot change projects in ${denied.environmentLabel ?? "this environment"}.`,
          ),
        ),
      );
      reportFailure(failureTitle, result);
      return result;
    },
    [reportFailure],
  );

  // Group-shared fields live on each physical project record, so a
  // group-level edit fans out to every member.
  const updateAllMembers = useCallback(
    async (
      input: Partial<{
        title: string;
        faviconPath: string | null;
        projectIcon: ProjectIconOverride | null;
      }>,
      failureTitle: string,
    ): Promise<AtomCommandResult<void, unknown>> => {
      const denied = checkProjectAccess(group.memberProjects, failureTitle);
      if (denied) return denied;
      const unavailable = group.memberProjects.find((member) => {
        const environment = environmentById.get(member.environmentId);
        return environment?.connection.phase !== "connected" || !environment.serverConfig;
      });
      if (unavailable) {
        const error = new Error(
          `Connect ${unavailable.environmentLabel ?? "the selected environment"} and try again.`,
        );
        const result: AtomCommandResult<void, unknown> = AsyncResult.failure(Cause.fail(error));
        reportFailure(failureTitle, result);
        return result;
      }
      for (const member of group.memberProjects) {
        const revoked = checkProjectAccess([member], failureTitle);
        if (revoked) return revoked;
        const result = mapAtomCommandResult(
          await updateProject({
            environmentId: member.environmentId,
            input: { projectId: member.id, ...input },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          // A partial fan-out is possible: earlier members already took the
          // write. Name the environment so the user knows where it stopped.
          reportFailure(
            group.memberProjects.length > 1
              ? `${failureTitle} on ${member.environmentLabel ?? "the current environment"}`
              : failureTitle,
            result,
          );
          return result;
        }
      }
      return AsyncResult.success(undefined);
    },
    [checkProjectAccess, environmentById, group.memberProjects, reportFailure, updateProject],
  );

  const renameGroup = useCallback(
    async (nextTitle: string, wasEdited: boolean) => {
      const title = nextTitle.trim();
      if (!title) {
        toastManager.add({ type: "warning", title: "Project title cannot be empty" });
        return;
      }
      if (
        !projectGroupTitleNeedsUpdate(
          group.memberProjects.map((member) => member.title),
          title,
          wasEdited,
        )
      ) {
        return;
      }
      await updateAllMembers({ title }, "Failed to rename project");
    },
    [group.memberProjects, updateAllMembers],
  );

  // ----- project icon -----
  const [faviconPickerOpen, setFaviconPickerOpen] = useComposerMenuState(!canEditGroup);
  const [iconPickerOpen, setIconPickerOpen] = useComposerMenuState(!canEditGroup);
  const [isSavingFavicon, setIsSavingFavicon] = useState(false);
  const savingFaviconRef = useRef(false);
  const setProjectIcon = useCallback(
    async (input: { faviconPath: string | null; projectIcon: ProjectIconOverride | null }) => {
      if (savingFaviconRef.current) return;
      savingFaviconRef.current = true;
      setIsSavingFavicon(true);
      try {
        await updateAllMembers(input, "Failed to update project icon");
      } finally {
        savingFaviconRef.current = false;
        setIsSavingFavicon(false);
      }
    },
    [updateAllMembers],
  );

  const hasMultipleCheckouts = group.memberProjects.length > 1;

  const toggleSeparateProject = (member: SidebarProjectGroupMember) => {
    const key = deriveProjectGroupingOverrideKey(member);
    const overrides = { ...groupingSettings.sidebarProjectGroupingOverrides };
    if (overrides[key] === "separate") {
      delete overrides[key];
    } else {
      overrides[key] = "separate";
    }
    void updateClientSettings({ sidebarProjectGroupingOverrides: overrides });
  };

  const changeProjectFolder = async (member: SidebarProjectGroupMember, path: string) => {
    const workspaceRoot = path.trim();
    if (!workspaceRoot || workspaceRoot === member.workspaceRoot) return;
    if (checkProjectAccess([member], "Failed to change project folder")) return;
    const api = readLocalApi();
    if (!api) return;
    const memberThreads = threads.filter(
      (thread) => thread.environmentId === member.environmentId && thread.projectId === member.id,
    );
    const checkoutThreads = memberThreads.filter((thread) => thread.worktreePath === null);
    const worktreeThreads = memberThreads.filter((thread) => thread.worktreePath !== null);
    const activeThreads = memberThreads.filter((thread) => threadRuntimeIsActive(thread.runtime));
    if (activeThreads.length > 0) {
      toastManager.add({
        type: "error",
        title: "Stop running work first",
        description: `${activeThreads.length} thread${activeThreads.length === 1 ? " is" : "s are"} running in this project. Stop ${activeThreads.length === 1 ? "it" : "them"} before changing the project folder.`,
      });
      return;
    }
    const affected = checkoutThreads.length + worktreeThreads.length;
    const confirmed = await settlePromise(() =>
      api.dialogs.confirm(
        [
          `Change the project folder from:\n${member.workspaceRoot}\n\nto:\n${workspaceRoot}`,
          ...(affected === 0
            ? ["This project has no threads yet."]
            : [
                `${checkoutThreads.length} thread${checkoutThreads.length === 1 ? "" : "s"} run in the project checkout and will use the new folder on their next message.`,
                ...(worktreeThreads.length === 0
                  ? []
                  : [
                      `${worktreeThreads.length} thread${worktreeThreads.length === 1 ? " has" : "s have"} their own worktree. ${worktreeThreads.length === 1 ? "It is" : "They are"} not moved, so ${worktreeThreads.length === 1 ? "it keeps" : "they keep"} working in the old location.`,
                    ]),
                "Checkpoints and diffs from before this change belong to the old folder. Reverting them afterwards can apply changes to different files.",
              ]),
          "Files are not moved or copied.",
        ].join("\n\n"),
        affected > 0 ? { variant: "destructive" } : undefined,
      ),
    );
    if (confirmed._tag === "Failure" || !confirmed.value) return;
    const result = mapAtomCommandResult(
      await updateProject({
        environmentId: member.environmentId,
        input: { projectId: member.id, workspaceRoot },
      }),
      () => undefined,
    );
    reportFailure("Failed to change project folder", result);
  };

  const removeMembers = useCallback(
    async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
      if (checkProjectAccess(members, "Failed to remove project")) return;
      const api = readLocalApi();
      if (!api) return;

      const memberKeys = new Set(members.map(memberKey));
      const projectThreads = threads.filter((thread) =>
        memberKeys.has(`${thread.environmentId}:${thread.projectId}`),
      );
      const isWholeGroup = members.length === group.memberProjects.length;
      const targetKind = hasOtherMembers || !isWholeGroup ? "checkout" : "project";
      const singleMember = members.length === 1 ? members[0]! : null;
      const targetLabel = singleMember?.title ?? group.displayName;
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            projectThreads.length > 0
              ? `Remove ${targetKind} "${targetLabel}" and delete its ${projectThreads.length} thread${projectThreads.length === 1 ? "" : "s"}?`
              : `Remove ${targetKind} "${targetLabel}"?`,
            ...(singleMember
              ? [
                  `Path: ${singleMember.workspaceRoot}`,
                  ...(singleMember.environmentLabel
                    ? [`Environment: ${singleMember.environmentLabel}`]
                    : []),
                ]
              : [`This removes ${members.length} grouped project entries.`]),
            ...(projectThreads.length > 0
              ? [
                  "This permanently clears conversation history for those threads and any archived threads.",
                ]
              : ["This permanently clears any archived conversation history."]),
            isWholeGroup && !hasOtherMembers
              ? "This removes only the project entries, not the files on disk."
              : "Other entries in this grouped project are unaffected.",
            "This action cannot be undone.",
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;
      if (checkProjectAccess(members, "Failed to remove project")) return;

      const draftStore = useComposerDraftStore.getState();
      for (const member of members) {
        if (checkProjectAccess([member], "Failed to remove project")) return;
        const memberThreads = projectThreads.filter(
          (thread) =>
            thread.environmentId === member.environmentId && thread.projectId === member.id,
        );
        const result = mapAtomCommandResult(
          await deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              force: true,
            },
          }),
          () => undefined,
        );
        if (result._tag === "Failure") {
          reportFailure(`Failed to remove "${member.title}"`, result);
          return;
        }
        const projectRef = scopeProjectRef(member.environmentId, member.id);
        releaseProjectDraftUploads(
          projectRef,
          memberThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
        );
        const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
        if (projectDraftThread) {
          draftStore.clearDraftThread(projectDraftThread.draftId);
        }
        draftStore.clearProjectDraftThreadId(projectRef);
      }

      if (isWholeGroup && !hasOtherMembers) {
        void navigate({ to: "/", replace: true });
      }
    },
    [
      checkProjectAccess,
      deleteProject,
      group.displayName,
      group.memberProjects.length,
      hasOtherMembers,
      navigate,
      reportFailure,
      threads,
    ],
  );

  return (
    <>
      <SettingsPageContainer className="gap-6">
        <Alert variant="info">
          <InfoIcon aria-hidden />
          <AlertDescription>
            Can't find a setting? Keep this project picked above and hop to any other settings page.
          </AlertDescription>
        </Alert>
        {hasMultipleCheckouts ? (
          <Alert variant="info">
            <InfoIcon aria-hidden />
            <AlertDescription>
              These folders are grouped together. Use Separate to keep a client as its own project
              with its conversations. Remove deletes that folder's project entry and conversations
              after confirmation.
            </AlertDescription>
          </Alert>
        ) : null}
        <SettingsSection id="project-overview" title="Project" hideTitle>
          {!canEditGroup ? (
            <p className="px-3 py-2 text-sm text-muted-foreground sm:px-4">
              {group.memberProjects.length > 1
                ? "Shared settings require permission to change every checkout in this group."
                : "This connection cannot change this project."}
            </p>
          ) : null}
          <SettingsRow
            title="Name"
            description="The shared name for this project group in the sidebar and thread lists."
            control={
              <Input
                key={`${group.projectKey}:${group.displayName}`}
                size="sm"
                className="w-full sm:w-64"
                aria-label="Project name"
                disabled={!canEditGroup}
                defaultValue={group.displayName}
                onChange={() => {
                  projectNameEditedRef.current = true;
                }}
                onBlur={(event) => {
                  const wasEdited = projectNameEditedRef.current;
                  projectNameEditedRef.current = false;
                  void renameGroup(event.currentTarget.value, wasEdited);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            }
          />
          {group.memberProjects.map((member) => (
            <ProjectFolderRow
              key={`${member.physicalProjectKey}:${member.workspaceRoot}`}
              member={member}
              disabled={!editableIds.has(member.environmentId)}
              onSave={(path) => void changeProjectFolder(member, path)}
              separated={
                groupingSettings.sidebarProjectGroupingOverrides?.[
                  deriveProjectGroupingOverrideKey(member)
                ] === "separate"
              }
              onSeparate={
                hasMultipleCheckouts ||
                hasOtherMembers ||
                groupingSettings.sidebarProjectGroupingOverrides?.[
                  deriveProjectGroupingOverrideKey(member)
                ] === "separate"
                  ? () => toggleSeparateProject(member)
                  : undefined
              }
              onRemove={() => void removeMembers([member])}
            />
          ))}
          <SettingsRow
            title="Project icon"
            description={
              projectIcon?.kind === "lucide"
                ? `${projectIcon.name} · ${projectIcon.color}`
                : projectIcon?.kind === "monogram"
                  ? `${projectIcon.text} · ${projectIcon.color}`
                  : projectIcon?.kind === "emoji"
                    ? projectIcon.emoji
                    : (faviconPath ?? "Automatic")
            }
            resetAction={
              group.memberProjects.some(
                (member) => member.faviconPath != null || member.projectIcon != null,
              ) ? (
                <SettingResetButton
                  label="project icon"
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => void setProjectIcon({ faviconPath: null, projectIcon: null })}
                />
              ) : null
            }
            control={
              <div className="flex items-center gap-2">
                <ProjectFavicon project={representative} className="size-6" />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label="Choose a project icon"
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => setIconPickerOpen(true)}
                >
                  Choose icon
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  aria-label="Choose a project icon file"
                  disabled={isSavingFavicon || !canEditGroup}
                  onClick={() => setFaviconPickerOpen(true)}
                >
                  Choose file
                </Button>
              </div>
            }
          />
        </SettingsSection>
        <ProjectDefaultsSettings category="project" />
        <ProjectActionsSettings />
        <SettingsSection title="Danger">
          <SettingsRow
            title={
              hasOtherMembers
                ? "Remove checkout"
                : group.memberProjects.length > 1
                  ? "Remove this project everywhere"
                  : "Remove project"
            }
            description={
              hasOtherMembers
                ? "Deletes the selected machine's checkout entries and their threads. Other machines and files on disk are not touched."
                : group.memberProjects.length > 1
                  ? `Deletes all ${group.memberProjects.length} checkout entries and their threads on every machine. Files on disk are not touched.`
                  : "Deletes the project entry and its threads. Files on disk are not touched."
            }
            control={
              <Button
                size="sm"
                variant="destructive-outline"
                disabled={!canEditGroup}
                onClick={() => void removeMembers(group.memberProjects)}
              >
                <Trash2Icon />
                {hasOtherMembers
                  ? "Remove checkout"
                  : group.memberProjects.length > 1
                    ? "Remove all entries"
                    : "Remove project"}
              </Button>
            }
          />
        </SettingsSection>
      </SettingsPageContainer>

      <ProjectFaviconPickerDialog
        key={`${representative.environmentId}:${representative.workspaceRoot}:${faviconPickerOpen}`}
        cwd={representative.workspaceRoot}
        environmentId={representative.environmentId}
        onOpenChange={setFaviconPickerOpen}
        {...(pickProjectFavicon
          ? { onPickExternal: () => pickProjectFavicon(representative.workspaceRoot) }
          : {})}
        onSelect={(path) => void setProjectIcon({ faviconPath: path, projectIcon: null })}
        open={faviconPickerOpen && canEditGroup}
        projectName={group.displayName}
      />
      {iconPickerOpen && canEditGroup ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            current={projectIcon}
            projectName={representative.title}
            open
            onOpenChange={setIconPickerOpen}
            onSelect={(icon) => void setProjectIcon({ faviconPath: null, projectIcon: icon })}
          />
        </Suspense>
      ) : null}
    </>
  );
}
