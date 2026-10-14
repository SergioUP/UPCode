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
  reason: Schema.optionalKey(Schema.NullOr(Schema.String)),
  priority: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdBy: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  comments: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemComment)),
  states: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemStateOption)),
  relations: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemRelation)),
  fields: Schema.optionalKey(Schema.Array(AzureDevOpsWorkItemField)),
});
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
  title: Schema.String,
  status: Schema.String,
  sourceBranch: Schema.String,
  targetBranch: Schema.String,
  url: Schema.String,
  createdBy: Schema.String,
  isDraft: Schema.Boolean,
});
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
