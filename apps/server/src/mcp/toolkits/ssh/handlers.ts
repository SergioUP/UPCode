import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { SshServerService } from "../../../ssh/SshServerService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { SshToolkit } from "./tools.ts";

const isOrchestratorMcpFailure = Schema.is(OrchestratorMcpFailure);

/** The caller must be allowed to reach saved servers at all. */
const capability = Effect.gen(function* () {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (!scope.capabilities.has("ssh")) {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "This credential cannot reach the servers saved in the Vault.",
    });
  }
  return scope;
});

/** The service owns the per-server check; this only turns its error into an MCP failure. */
const asMcpFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError((cause) => {
      if (isOrchestratorMcpFailure(cause)) return cause;
      const tagged = cause as {
        readonly _tag?: unknown;
        readonly code?: unknown;
        readonly message?: unknown;
      };
      const message =
        typeof tagged.message === "string"
          ? tagged.message
          : cause instanceof Error
            ? cause.message
            : String(cause);
      return new OrchestratorMcpFailure({
        code:
          tagged.code === "access_denied"
            ? "capability_denied"
            : tagged.code === "not_found" || tagged.code === "not_configured"
              ? "invalid_request"
              : "orchestration_error",
        message,
      });
    }),
  );

const handlers = {
  ssh_list_servers: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* SshServerService;
      const servers = yield* asMcpFailure(service.list());
      return {
        servers:
          input.onlyWithAgentAccess === true
            ? servers.filter((server) => server.agentAccess !== "off")
            : servers,
      };
    }),
  ),

  ssh_tail_file: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* SshServerService;
      return yield* asMcpFailure(
        service.readFile({ server: input.server, path: input.path, lines: input.lines ?? 200 }),
      );
    }),
  ),

  ssh_read_file: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* SshServerService;
      return yield* asMcpFailure(
        service.readFile({
          server: input.server,
          path: input.path,
          lines: input.lines ?? null,
        }),
      );
    }),
  ),

  ssh_list_directory: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* SshServerService;
      return yield* asMcpFailure(service.listDirectory({ server: input.server, path: input.path }));
    }),
  ),

  ssh_run_command: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      yield* capability;
      const service = yield* SshServerService;
      return yield* asMcpFailure(
        service.run({
          server: input.server,
          command: input.command,
          require: "commands",
          ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
        }),
      );
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof SshToolkit.tools>;

export const layer = McpToolAccess.toLayer(SshToolkit, handlers);
