import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as ServerConfig from "../../../config.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ServerConfig.ServerConfig,
  ],
};

const SaveIncidentEvidenceTool = Tool.make("t3_incident_save_evidence", {
  ...shared,
  description:
    "Save a captured read-only investigation result as evidence on the incident that owns the calling conversation. Call it for every relevant result the user should be able to review later, grouped by its source (e.g. Shopify, ERP, PostgreSQL, Logs). Pass the content already sanitized: never include passwords, tokens, private keys or full connection strings. Prefer a short summary plus the exact payload.",
  parameters: Schema.Struct({
    title: Schema.String,
    source: Schema.String,
    contentType: Schema.Literals(["json", "text", "log", "table", "http", "error"]),
    content: Schema.String,
    summary: Schema.optionalKey(Schema.String),
  }),
  success: Schema.Struct({ incidentId: Schema.String, evidenceCount: Schema.Int }),
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false);

const UpdateIncidentSummaryTool = Tool.make("t3_incident_update_summary", {
  ...shared,
  description:
    "Replace the incident's investigation summary. Separate verified facts, possible explanations and what is still unverified; never present a hypothesis as a confirmed fact. This is a short, readable summary, not a full report.",
  parameters: Schema.Struct({ summary: Schema.String }),
  success: Schema.Struct({ incidentId: Schema.String }),
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false);

export const IncidentToolkit = Toolkit.make(SaveIncidentEvidenceTool, UpdateIncidentSummaryTool);
