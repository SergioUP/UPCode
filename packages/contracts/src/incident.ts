import * as Schema from "effect/Schema";

/**
 * Incident Center is a read-only investigation workspace built on top of T3
 * threads. An incident owns one conversation plus the evidence the agent saves
 * while investigating; the app itself persists all of it locally.
 */

export const IncidentStatus = Schema.Literals(["open", "investigating", "resolved"]);
export type IncidentStatus = typeof IncidentStatus.Type;

export const IncidentEvidenceContentType = Schema.Literals([
  "json",
  "text",
  "log",
  "table",
  "http",
  "error",
]);
export type IncidentEvidenceContentType = typeof IncidentEvidenceContentType.Type;

export const IncidentEvidence = Schema.Struct({
  id: Schema.String,
  incidentId: Schema.String,
  title: Schema.String,
  /** Free-form origin the agent chose, e.g. "Shopify", "ERP", "PostgreSQL", "Logs". */
  source: Schema.String,
  contentType: IncidentEvidenceContentType,
  content: Schema.String,
  summary: Schema.optionalKey(Schema.NullOr(Schema.String)),
  capturedAt: Schema.String,
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type IncidentEvidence = typeof IncidentEvidence.Type;

export const Incident = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  status: IncidentStatus,
  projectId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  environmentId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  workspaceRoot: Schema.optionalKey(Schema.NullOr(Schema.String)),
  branch: Schema.optionalKey(Schema.NullOr(Schema.String)),
  /** The one conversation this incident investigates in. */
  threadId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  summary: Schema.optionalKey(Schema.NullOr(Schema.String)),
  evidence: Schema.Array(IncidentEvidence),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  resolvedAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
});
export type Incident = typeof Incident.Type;

/** Payload the agent (or the UI) sends to attach a captured result to an incident. */
export const IncidentEvidenceInput = Schema.Struct({
  incidentId: Schema.String,
  title: Schema.String,
  source: Schema.String,
  contentType: IncidentEvidenceContentType,
  content: Schema.String,
  summary: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type IncidentEvidenceInput = typeof IncidentEvidenceInput.Type;

export class IncidentStoreError extends Schema.TaggedError<IncidentStoreError>()(
  "IncidentStoreError",
  {
    reason: Schema.Literals(["not-found", "failed", "invalid"]),
    message: Schema.String,
  },
) {}
