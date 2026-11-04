// @effect-diagnostics globalFetchInEffect:off -- The tracker delegates to boundaries that own their own HTTP.
/**
 * The tasks section's tracker, chosen by `settings.trackerProvider`.
 *
 * Work items are the only thing both trackers model the same way, so they are
 * the only methods that switch. Repositories and pull requests stay on Azure:
 * Jira has neither, and the pull-request section keeps working untouched.
 *
 * @module tracker
 */
import type {
  AzureDevOpsProject,
  AzureDevOpsWorkItem,
  AzureDevOpsWorkItemStateOption,
  AzureDevOpsWorkspaceError,
  TrackerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as AzureDevOpsWorkspace from "./azureDevOpsWorkspace.ts";
import * as JiraWorkspace from "./jiraWorkspace.ts";
import * as ServerSettings from "./serverSettings.ts";

type TrackerError = AzureDevOpsWorkspaceError;

export const make = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const azure = yield* AzureDevOpsWorkspace.make;
  const jira = yield* JiraWorkspace.make;

  const provider: Effect.Effect<TrackerProvider> = serverSettings.getSettings.pipe(
    Effect.map((settings) => settings.trackerProvider),
    Effect.orElseSucceed((): TrackerProvider => "azure"),
  );

  /** Runs the Jira implementation only when the section is switched to it. */
  const dispatch = <A>(
    onAzure: () => Effect.Effect<A, TrackerError>,
    onJira: () => Effect.Effect<A, TrackerError>,
  ): Effect.Effect<A, TrackerError> =>
    provider.pipe(Effect.flatMap((current) => (current === "jira" ? onJira() : onAzure())));

  return {
    config: dispatch<{ organization: string; connected: boolean }>(
      () => azure.config,
      () => jira.config,
    ),
    listProjects: dispatch<ReadonlyArray<AzureDevOpsProject>>(
      () => azure.listProjects,
      () => jira.listProjects,
    ),
    listWorkItems: (
      project: string | undefined,
      assignedToMe: boolean,
      query?: string,
      type?: string,
      iteration?: string,
    ) =>
      dispatch<ReadonlyArray<AzureDevOpsWorkItem>>(
        () => azure.listWorkItems(project, assignedToMe, query, type, iteration),
        () =>
          jira.listWorkItems({
            ...(project ? { project } : {}),
            assignedToMe,
            ...(query ? { query } : {}),
          }),
      ),
    listWorkItemStates: (projects: ReadonlyArray<string>, type: string) =>
      dispatch<ReadonlyArray<AzureDevOpsWorkItemStateOption>>(
        () => azure.listWorkItemStates(projects, type),
        () => jira.listWorkItemStates(projects, type),
      ),
    listAssignedWorkItems: () =>
      dispatch<ReadonlyArray<AzureDevOpsWorkItem>>(
        () => azure.listAssignedWorkItems(),
        () => jira.listAssignedWorkItems(),
      ),
    getWorkItem: (project: string, id: number) =>
      dispatch<AzureDevOpsWorkItem>(
        () => azure.getWorkItem(project, id),
        () => jira.getWorkItem(project, id),
      ),
    updateWorkItem: (input: {
      project: string;
      id: number;
      comment?: string;
      state?: string;
      title?: string;
      description?: string;
      assignedTo?: string | null;
      areaPath?: string;
      iterationPath?: string;
    }) =>
      dispatch<AzureDevOpsWorkItem>(
        () => azure.updateWorkItem(input),
        () =>
          jira.updateWorkItem({
            project: input.project,
            id: input.id,
            ...(input.comment === undefined ? {} : { comment: input.comment }),
            ...(input.state === undefined ? {} : { state: input.state }),
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.description === undefined ? {} : { description: input.description }),
          }),
      ),
    /** Repositories and pull requests are Azure's alone; Jira mode never reads them here. */
    listRepositories: azure.listRepositories,
    listBranches: azure.listBranches,
    listPullRequests: azure.listPullRequests,
    getPullRequestDetail: azure.getPullRequestDetail,
  };
});

export type Tracker = Effect.Success<typeof make>;
