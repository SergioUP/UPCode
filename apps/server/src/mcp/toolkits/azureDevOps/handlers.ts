import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { AzureWorkItemMcpService } from "./service.ts";
import { AzureDevOpsToolkit } from "./tools.ts";

/** The caller must be allowed to touch Azure at all. */
const capability = Effect.gen(function* () {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (!scope.capabilities.has("azure-devops")) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "This credential cannot read or link Azure DevOps work items.",
    });
  }
  return scope;
});

const handlers = {
  azure_devops_my_work_items: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* AzureWorkItemMcpService;
      return yield* service.myWorkItems(input);
    }),
  ),

  azure_devops_work_item: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* AzureWorkItemMcpService;
      return yield* service.workItem(input);
    }),
  ),

  azure_devops_link_thread: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* capability;
      const service = yield* AzureWorkItemMcpService;
      return yield* service.link(scope, input);
    }),
  ),

  azure_devops_unlink_thread: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* capability;
      const service = yield* AzureWorkItemMcpService;
      return yield* service.unlink(scope, input.threadId);
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof AzureDevOpsToolkit.tools>;

export const layer = McpToolAccess.toLayer(AzureDevOpsToolkit, handlers);
