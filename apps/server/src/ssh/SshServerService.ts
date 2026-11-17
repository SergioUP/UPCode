/**
 * The servers saved in the Vault, and the only way anything reaches them.
 *
 * This is a thin layer over `@upcode/ssh/command`: it resolves a saved server,
 * decides how to authenticate, and runs one non-interactive command. Three rules
 * live here rather than in the callers:
 *
 * - **A server is reached by name.** `id` or `label`, case-insensitive, because
 *   that is what the user says out loud and what an agent has to pass.
 * - **`agentAccess` is enforced server-side.** A tool cannot talk its way past
 *   `off` or `read-only`; the check runs on every call.
 * - **Credentials never reach a command line.** A password rides in the askpass
 *   helper's environment, and a pasted key is written to a private temp file
 *   that is removed when the run ends.
 *
 * Host keys are checked the way ssh already does it: a new host is trusted once
 * (`accept-new`), and a host whose key changed fails with `host_key` instead of
 * silently connecting.
 *
 * @module ssh/SshServerService
 */

import type {
  SshCommandOutput,
  SshConnectionReport,
  SshError,
  SshServer,
  SshServerSummary,
} from "@upcode/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { isSshAuthFailure } from "@upcode/ssh/auth";
import { runSshCommand } from "@upcode/ssh/command";
import { SshCommandError, SshInvalidTargetError } from "@upcode/ssh/errors";

import * as ServerSettings from "../serverSettings.ts";
import {
  allowsAccess,
  hasSecretValue,
  resolveSavedServer,
  toServerSummary,
  trimSshOutput,
} from "./logic.ts";

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 45_000;

export interface RunSshInput {
  /** Id or label, as the user named it. */
  readonly server: string;
  readonly command: string;
  readonly timeoutMs?: number;
}

export interface ReadSshFileInput {
  readonly server: string;
  readonly path: string;
  /** Read at most this many trailing lines. Null reads the whole file. */
  readonly lines?: number | null;
}

/** What a command needs from the environment: the platform services `ssh` runs on. */
export type SshRunRequirements =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path;

export interface SshServerServiceShape {
  readonly list: () => Effect.Effect<ReadonlyArray<SshServerSummary>, SshError>;
  /** Opens a connection and reads one line; never checks `agentAccess`. */
  readonly test: (server: string) => Effect.Effect<SshConnectionReport, SshError>;
  readonly run: (
    input: RunSshInput & { readonly require: "read-only" | "commands" },
  ) => Effect.Effect<SshCommandOutput, SshError>;
  readonly readFile: (input: ReadSshFileInput) => Effect.Effect<SshCommandOutput, SshError>;
  readonly listDirectory: (input: {
    readonly server: string;
    readonly path: string;
  }) => Effect.Effect<SshCommandOutput, SshError>;
}

export class SshServerService extends Context.Service<SshServerService, SshServerServiceShape>()(
  "upcode/ssh/SshServerService",
) {}

const failure = (code: SshError["code"], message: string): SshError => ({
  _tag: "SshError",
  code,
  message,
});

const quoteRemoteArg = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

const toSshError = (cause: SshCommandError | SshInvalidTargetError, label: string): SshError => {
  if (cause instanceof SshInvalidTargetError) {
    return failure("not_configured", cause.message);
  }
  const stderr = cause.stderr.trim();
  const detail = stderr.length > 0 ? stderr : cause.message;
  if (isSshAuthFailure(cause)) {
    return failure("auth_failed", `${label}: la autenticación falló. ${detail}`);
  }
  if (/host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/iu.test(detail)) {
    return failure(
      "host_key",
      `${label}: la huella del servidor no coincide con la guardada en known_hosts. ${detail}`,
    );
  }
  if (/timed out|timeout/iu.test(detail)) {
    return failure("timeout", `${label}: el servidor no respondió a tiempo. ${detail}`);
  }
  if (cause.exitCode === null) {
    return failure("connect_failed", `${label}: no se pudo conectar. ${detail}`);
  }
  return failure(
    "command_failed",
    `${label}: el comando terminó con código ${cause.exitCode}. ${detail}`,
  );
};

export const make = Effect.gen(function* () {
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  /**
   * The service owns the platform services every run needs, so callers — an MCP
   * handler, a WebSocket method — never have to carry them.
   */
  const providePlatform = <A, E>(effect: Effect.Effect<A, E, SshRunRequirements>) =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

  const readServers = serverSettings.getSettings.pipe(
    Effect.mapError(() =>
      failure("not_configured", "No se pudo leer la configuración de servidores."),
    ),
    Effect.map((settings) => settings.sshServers),
  );

  const requireServer = (reference: string, minimum: SshServer["agentAccess"]) =>
    Effect.gen(function* () {
      const servers = yield* readServers;
      const server = resolveSavedServer(servers, reference);
      if (server === undefined) {
        return yield* Effect.fail(
          failure(
            "not_found",
            `No hay ningún servidor "${reference}" en el baúl. Los guardados son: ${
              servers.map((entry) => entry.label).join(", ") || "ninguno"
            }.`,
          ),
        );
      }
      if (!allowsAccess(server.agentAccess, minimum)) {
        return yield* Effect.fail(
          failure(
            "access_denied",
            `El servidor "${server.label}" no permite eso: su acceso para agentes está en "${server.agentAccess}".`,
          ),
        );
      }
      return server;
    });

  /** A pasted key is written where only this process can read it, for one run. */
  const withIdentityFile = <A, R>(
    server: SshServer,
    use: (identityFile: string | null) => Effect.Effect<A, SshError, R>,
  ): Effect.Effect<A, SshError, R> =>
    Effect.gen(function* () {
      if (server.auth !== "key-contents" || !hasSecretValue(server.privateKey)) {
        return yield* use(
          server.auth === "key-file" && server.identityFile.length > 0 ? server.identityFile : null,
        );
      }
      const directory = yield* fs
        .makeTempDirectory({ prefix: "upcode-ssh-key-" })
        .pipe(
          Effect.mapError(() =>
            failure("connect_failed", "No se pudo preparar la clave SSH temporal."),
          ),
        );
      const keyPath = path.join(directory, "id_key");
      const privateKey = server.privateKey.endsWith("\n")
        ? server.privateKey
        : `${server.privateKey}\n`;
      const write = fs.writeFileString(keyPath, privateKey).pipe(
        Effect.andThen(fs.chmod(keyPath, 0o600)),
        Effect.mapError(() =>
          failure("connect_failed", "No se pudo escribir la clave SSH temporal."),
        ),
      );
      return yield* Effect.ensuring(
        write.pipe(Effect.andThen(use(keyPath))),
        fs.remove(directory, { recursive: true }).pipe(Effect.ignore),
      );
    });

  const targetFor = (server: SshServer) => ({
    alias: server.host,
    hostname: server.host,
    username: server.username.length > 0 ? server.username : null,
    port: server.port ?? null,
  });

  const authOptions = (server: SshServer) =>
    server.auth === "password" && hasSecretValue(server.password)
      ? { authSecret: server.password, interactiveAuth: true, batchMode: "no" as const }
      : {};

  const runCommand = (server: SshServer, command: string, timeoutMs: number) =>
    withIdentityFile(server, (identityFile) =>
      runSshCommand(targetFor(server), {
        preHostArgs: [
          "-o",
          "StrictHostKeyChecking=accept-new",
          ...(identityFile === null ? [] : ["-i", identityFile]),
        ],
        remoteCommandArgs: ["sh", "-c", quoteRemoteArg(command)],
        ...authOptions(server),
        timeoutMs,
      }).pipe(Effect.mapError((cause) => toSshError(cause, server.label))),
    );

  const execute = Effect.fn("SshServerService.execute")(function* (
    input: RunSshInput & { readonly require: "read-only" | "commands" },
  ) {
    const server = yield* requireServer(input.server, input.require);
    const startedAt = yield* Clock.currentTimeMillis;
    const output = yield* runCommand(
      server,
      input.command,
      input.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    );
    const finishedAt = yield* Clock.currentTimeMillis;
    const stdout = trimSshOutput(output.stdout);
    const stderr = trimSshOutput(output.stderr);
    return {
      id: server.id,
      label: server.label,
      host: server.host,
      command: input.command,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
      elapsedMs: Math.max(0, finishedAt - startedAt),
    } satisfies SshCommandOutput;
  });

  const test = Effect.fn("SshServerService.test")(function* (reference: string) {
    const servers = yield* readServers;
    const server = resolveSavedServer(servers, reference);
    if (server === undefined) {
      return yield* Effect.fail(
        failure("not_found", `No hay ningún servidor "${reference}" en el baúl.`),
      );
    }
    const startedAt = yield* Clock.currentTimeMillis;
    const output = yield* runCommand(server, "uname -sr 2>/dev/null || true", TEST_TIMEOUT_MS);
    const finishedAt = yield* Clock.currentTimeMillis;
    const system = output.stdout.trim();
    return {
      id: server.id,
      label: server.label,
      hostname: server.host,
      username: server.username.length > 0 ? server.username : null,
      port: server.port ?? null,
      system: system.length > 0 ? system.split(/\r?\n/u)[0]!.slice(0, 120) : null,
      elapsedMs: Math.max(0, finishedAt - startedAt),
    } satisfies SshConnectionReport;
  });

  return SshServerService.of({
    list: () => Effect.map(readServers, (servers) => servers.map(toServerSummary)),
    test: (reference) => providePlatform(test(reference)),
    run: (input) => providePlatform(execute(input)),
    readFile: (input) => {
      const lines = input.lines ?? null;
      const command =
        lines === null || lines <= 0
          ? `cat -- ${quoteRemoteArg(input.path)}`
          : `tail -n ${Math.min(Math.max(1, Math.floor(lines)), 2000)} -- ${quoteRemoteArg(input.path)}`;
      return providePlatform(execute({ server: input.server, command, require: "read-only" }));
    },
    listDirectory: (input) =>
      providePlatform(
        execute({
          server: input.server,
          command: `ls -la -- ${quoteRemoteArg(input.path)}`,
          require: "read-only",
        }),
      ),
  });
});

export const layer = Layer.effect(SshServerService, make);

/** Re-exported so the module's dependencies are visible where the layer is built. */
export type SshServerServiceRequirements =
  | ServerSettings.ServerSettingsService
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path;
