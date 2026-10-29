import * as Schema from "effect/Schema";

/** Azure DevOps work-item identity is stable across threads and repositories. */
export const AzureDevOpsWorkItemLink = Schema.Struct({
  organization: Schema.String,
  project: Schema.String,
  workItemId: Schema.Int,
});
export type AzureDevOpsWorkItemLink = typeof AzureDevOpsWorkItemLink.Type;

export const AzureDevOpsProject = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  url: Schema.String,
});
export const AzureDevOpsWorkItemComment = Schema.Struct({
  id: Schema.Int,
  author: Schema.String,
  text: Schema.String,
  createdAt: Schema.NullOr(Schema.String),
});
export const AzureDevOpsWorkItemStateOption = Schema.Struct({
  name: Schema.String,
  color: Schema.String,
  category: Schema.String,
});
export type AzureDevOpsWorkItemStateOption = typeof AzureDevOpsWorkItemStateOption.Type;
export const AzureDevOpsWorkItemRelation = Schema.Struct({
  name: Schema.String,
  id: Schema.NullOr(Schema.Int),
  title: Schema.NullOr(Schema.String),
  url: Schema.String,
});
export const AzureDevOpsWorkItemField = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
});
/**
 * Labels are local to UPCode: they are never read from or written to ADO, so this
 * map is the whole source of truth. Keyed by `project#workItemId`, the way the
 * work-item views identify an item inside one organization.
 */
export const AzureDevOpsIssueLabels = Schema.Record(Schema.String, Schema.Array(Schema.String));
export type AzureDevOpsIssueLabels = typeof AzureDevOpsIssueLabels.Type;

/** `project#workItemId`, the key `AzureDevOpsIssueLabels` uses. */
export const azureDevOpsIssueKey = (project: string, id: number): string => `${project}#${id}`;
export const AzureDevOpsWorkItem = Schema.Struct({
  id: Schema.Int,
  project: Schema.String,
  title: Schema.String,
  type: Schema.String,
  state: Schema.String,
  assignedTo: Schema.NullOr(Schema.String),
  iteration: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  url: Schema.String,
  changedAt: Schema.NullOr(Schema.String),
  area: Schema.optionalKey(Schema.NullOr(Schema.String)),
  /** ADO avatar for the assignee; the board and the list use it as the card's identity. */
  assignedToAvatar: Schema.optionalKey(Schema.NullOr(Schema.String)),
  assignedToEmail: Schema.optionalKey(Schema.NullOr(Schema.String)),
  parentId: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  /** Dates of the sprint this item belongs to, so the calendar needs no extra call. */
  iterationStart: Schema.optionalKey(Schema.NullOr(Schema.String)),
  iterationFinish: Schema.optionalKey(Schema.NullOr(Schema.String)),
  reason: Schema.optionalKey(Schema.NullOr(Schema.String)),
  priority: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdBy: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  comments: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemComment)),
  states: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemStateOption)),
  relations: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemRelation)),
  fields: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemField)),
  /** Title of the parent task, so a list can show what the sub-task belongs to. */
  parentTitle: Schema.optionalKey(Schema.NullOr(Schema.String)),
  /** Hours from `Microsoft.VSTS.Scheduling.*`: planned, spent and pending. */
  originalEstimate: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  completedWork: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  remainingWork: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});
export type AzureDevOpsWorkItem = typeof AzureDevOpsWorkItem.Type;
export const AzureDevOpsRepository = Schema.Struct({
  id: Schema.String,
  project: Schema.String,
  name: Schema.String,
  webUrl: Schema.String,
  remoteUrl: Schema.String,
  defaultBranch: Schema.NullOr(Schema.String),
});
export const AzureDevOpsPullRequest = Schema.Struct({
  id: Schema.Int,
  repositoryId: Schema.String,
  /** Repository folder name, used to match the pull request to a local T3 project. */
  repositoryName: Schema.optionalKey(Schema.String),
  /** Repository remote URL, used to match the pull request to a local T3 project. */
  repositoryRemoteUrl: Schema.optionalKey(Schema.String),
  title: Schema.String,
  status: Schema.String,
  sourceBranch: Schema.String,
  targetBranch: Schema.String,
  url: Schema.String,
  createdBy: Schema.String,
  isDraft: Schema.Boolean,
});
export type AzureDevOpsPullRequest = typeof AzureDevOpsPullRequest.Type;
export const AzureDevOpsBranch = Schema.Struct({
  name: Schema.String,
  objectId: Schema.String,
});
export const AzureDevOpsQualityGate = Schema.Struct({
  workItemLinked: Schema.Boolean,
  pullRequestLinked: Schema.Boolean,
  pullRequestStatus: Schema.NullOr(Schema.String),
  policyStatus: Schema.NullOr(Schema.String),
  outcome: Schema.Literals(["approved", "failed", "no-evidence"]),
});
export const AzureDevOpsPullRequestDetail = Schema.Struct({
  id: Schema.Int,
  linkedWorkItemIds: Schema.Array(Schema.Int),
  policies: Schema.Array(
    Schema.Struct({ name: Schema.String, status: Schema.String, blocking: Schema.Boolean }),
  ),
  qualityGate: AzureDevOpsQualityGate,
});

/**
 * Somebody a review can be asked of, as the Identity API names them. `id` is the
 * identity guid the reviewers endpoint addresses.
 */
export const AzureDevOpsIdentity = Schema.Struct({
  id: Schema.String,
  displayName: Schema.String,
  email: Schema.NullOr(Schema.String),
});
export type AzureDevOpsIdentity = typeof AzureDevOpsIdentity.Type;

/** A reviewer already on a pull request: `vote` is ADO's -10..10 scale, 0 = no vote yet. */
export const AzureDevOpsPullRequestReviewer = Schema.Struct({
  id: Schema.String,
  displayName: Schema.String,
  uniqueName: Schema.NullOr(Schema.String),
  vote: Schema.NullOr(Schema.Int),
});
export type AzureDevOpsPullRequestReviewer = typeof AzureDevOpsPullRequestReviewer.Type;

/** What a pull request carries beyond its own fields: its work items and its reviewers. */
export const AzureDevOpsPullRequestExtras = Schema.Struct({
  linkedWorkItemIds: Schema.Array(Schema.Int),
  reviewers: Schema.Array(AzureDevOpsPullRequestReviewer),
});
export type AzureDevOpsPullRequestExtras = typeof AzureDevOpsPullRequestExtras.Type;

export const AzureDevOpsReviewerCandidatesInput = Schema.Struct({
  query: Schema.String,
});
export type AzureDevOpsReviewerCandidatesInput = typeof AzureDevOpsReviewerCandidatesInput.Type;

export const AzureDevOpsPullRequestExtrasInput = Schema.Struct({
  /** `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`. */
  pullRequestUrl: Schema.String,
});
export type AzureDevOpsPullRequestExtrasInput = typeof AzureDevOpsPullRequestExtrasInput.Type;

/** Exactly one of `workItem` and `reviewer` per call; the server refuses both and neither. */
export const AzureDevOpsUpdatePullRequestExtrasInput = Schema.Struct({
  ...AzureDevOpsPullRequestExtrasInput.fields,
  workItem: Schema.optionalKey(Schema.Struct({ id: Schema.Int, linked: Schema.Boolean })),
  reviewer: Schema.optionalKey(Schema.Struct({ id: Schema.String, requested: Schema.Boolean })),
});
export type AzureDevOpsUpdatePullRequestExtrasInput =
  typeof AzureDevOpsUpdatePullRequestExtrasInput.Type;

export const AzureDevOpsAzCliStatus = Schema.Struct({
  installed: Schema.Boolean,
  devopsExtension: Schema.Boolean,
  account: Schema.NullOr(Schema.String),
});
export type AzureDevOpsAzCliStatus = typeof AzureDevOpsAzCliStatus.Type;

export class AzureDevOpsWorkspaceError extends Schema.TaggedError<AzureDevOpsWorkspaceError>()(
  "AzureDevOpsWorkspaceError",
  {
    reason: Schema.Literals([
      "configuration",
      "authentication",
      "forbidden",
      "not-found",
      "rate-limited",
      "failed",
    ]),
    message: Schema.String,
  },
) {}
