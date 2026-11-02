import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { McpServer } from "effect/ai";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import { layerAzureDevOpsToolkit } from "../../McpHttpServer.ts";

/**
 * The layer under test is the production registration, not a hand-built
 * toolkit: what these assert is what an agent sees after a restart.
 */
const layerUnderTest = layerAzureDevOpsToolkit.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(NodeCrypto.layer),
  Layer.provide(NodeServices.layer),
  Layer.provide(ServerSettings.layerTest()),
  Layer.provide(Layer.mock(ThreadManagementService.ThreadManagementService)({})),
);

const TOOL_NAMES = [
  "azure_devops_link_thread",
  "azure_devops_my_work_items",
  "azure_devops_unlink_thread",
  "azure_devops_work_item",
];

it.effect("advertises the four work item tools to the agent", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const names = server.tools.map(({ tool }) => tool.name).sort();

    expect(names).toEqual(TOOL_NAMES);
  }).pipe(Effect.provide(layerUnderTest)),
);

it.effect("describes each tool so the model knows when to reach for it", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const byName = new Map(server.tools.map(({ tool }) => [tool.name, tool]));

    for (const name of TOOL_NAMES) {
      const tool = byName.get(name);
      expect(tool).toBeDefined();
      // Long enough to carry "what it does, when to use it, what it changes".
      expect((tool?.description ?? "").length).toBeGreaterThan(200);
    }

    expect(byName.get("azure_devops_my_work_items")?.description).toContain("Never choose");
    expect(byName.get("azure_devops_link_thread")?.description).toContain(
      "Nothing is written to Azure DevOps",
    );
  }).pipe(Effect.provide(layerUnderTest)),
);

it.effect("marks the two linking tools as writes and the readers as reads", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const byName = new Map(server.tools.map(({ tool }) => [tool.name, tool]));
    const annotations = (name: string) =>
      (byName.get(name) as unknown as { annotations?: Record<string, unknown> }).annotations;

    expect(annotations("azure_devops_my_work_items")?.readOnlyHint).toBe(true);
    expect(annotations("azure_devops_work_item")?.readOnlyHint).toBe(true);
    expect(annotations("azure_devops_link_thread")?.readOnlyHint).toBe(false);
    expect(annotations("azure_devops_unlink_thread")?.readOnlyHint).toBe(false);
  }).pipe(Effect.provide(layerUnderTest)),
);

it.effect("titles each tool with UPCode so it cannot be mistaken for another server", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    for (const { tool } of server.tools) {
      expect(tool.annotations?.title).toContain("UPCode");
    }
  }).pipe(Effect.provide(layerUnderTest)),
);
