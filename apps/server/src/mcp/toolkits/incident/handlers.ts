import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as IncidentStore from "../../../incidents/incidentStore.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readCaller, unavailable } from "../../threadAccess.ts";
import { IncidentToolkit } from "./tools.ts";

/** The incident that owns the calling conversation, or a refusal that names why. */
const resolveIncident = Effect.gen(function* () {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  if (!invocation.capabilities.has("incident")) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Incident tools are only available inside an Incident Center conversation.",
    });
  }
  const caller = yield* readCaller();
  const threadId = caller.scope.thread?.threadId;
  if (threadId === undefined) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Incident evidence can only be saved from inside a linked conversation.",
    });
  }
  const store = yield* IncidentStore.make;
  const incident = yield* store.findByThread(threadId).pipe(Effect.mapError(unavailable));
  if (incident === null) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "This conversation is not linked to an incident in Incident Center.",
    });
  }
  return { store, incident };
});

export const layer = McpToolAccess.toLayer(IncidentToolkit, {
  t3_incident_save_evidence: McpToolAccess.actsAsCaller((params) =>
    Effect.gen(function* () {
      const { store, incident } = yield* resolveIncident;
      const updated = yield* store
        .addEvidence({
          incidentId: incident.id,
          title: params.title,
          source: params.source,
          contentType: params.contentType,
          content: params.content,
          ...(params.summary !== undefined ? { summary: params.summary } : {}),
          ...(params.metadata !== undefined ? { metadata: { ...params.metadata } } : {}),
        })
        .pipe(Effect.mapError(unavailable));
      return { incidentId: updated.id, evidenceCount: updated.evidence.length };
    }),
  ),
  t3_incident_update_summary: McpToolAccess.actsAsCaller((params) =>
    Effect.gen(function* () {
      const { store, incident } = yield* resolveIncident;
      const updated = yield* store
        .update({ id: incident.id, summary: params.summary })
        .pipe(Effect.mapError(unavailable));
      return { incidentId: updated.id };
    }),
  ),
});
