/**
 * SSH servers the user saved in the Vault, and what an agent may do with them.
 *
 * A saved server is a *name* (`label`) plus how to reach it. Credentials ride in
 * the settings schema marked `settingsSecret`, so they live in the server's
 * secret store and never reach a client: a client only ever sees the redaction
 * marker. The SSH key or password is never part of a command line.
 *
 * `agentAccess` is the per-server gate. It defaults to `off`, so adding a server
 * grants an agent nothing until the user says so, and `read-only` still lets it
 * inspect files and logs without running arbitrary commands.
 *
 * @module SshServers
 */

import { Schema } from "effect";
import * as Effect from "effect/Effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Enough for a person's servers; the list rides in the settings file. */
export const SSH_SERVER_MAX_COUNT = 50;

export const SSH_SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Stable, URL-safe, and chosen by the client once; secrets are keyed by it. */
export const SshServerId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(SSH_SERVER_ID_PATTERN),
);
export type SshServerId = typeof SshServerId.Type;

/** How the connection authenticates. The secret itself is never in this struct. */
export const SshServerAuth = Schema.Literals(["agent", "key-file", "key-contents", "password"]);
export type SshServerAuth = typeof SshServerAuth.Type;

/**
 * What an agent may do on this server.
 *
 * - `off`: credentials are the user's; no tool touches it.
 * - `read-only`: list folders, read files and tail logs.
 * - `commands`: also run arbitrary non-interactive commands.
 */
export const SshServerAgentAccess = Schema.Literals(["off", "read-only", "commands"]);
export type SshServerAgentAccess = typeof SshServerAgentAccess.Type;

/**
 * A value the server keeps in its secret store. A client receives the redaction
 * marker instead, and sending that marker back keeps whatever is stored.
 */
const secretText = Schema.String.pipe(
  Schema.withDecodingDefault(Effect.succeed("")),
  Schema.annotateKey({ settingsSecret: true }),
);

export const SshServer = Schema.Struct({
  id: SshServerId,
  /** The name the user and the agent call it by, such as "lotes-prod". */
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  /** Hostname or IP, or an alias already present in `~/.ssh/config`. */
  host: TrimmedNonEmptyString.check(
    Schema.isMaxLength(255),
    Schema.makeFilter(
      (host) => !host.startsWith("-") || "A host cannot start with a dash: it is an ssh flag.",
    ),
  ),
  port: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
  /** Empty means "whatever `~/.ssh/config` says". */
  username: TrimmedNonEmptyString.check(Schema.isMaxLength(64)).pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
  ),
  auth: SshServerAuth.pipe(Schema.withDecodingDefault(Effect.succeed("agent" as const))),
  /** `auth: "key-file"`: a path resolved on the server machine. */
  identityFile: Schema.String.check(Schema.isMaxLength(512)).pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
  ),
  /** `auth: "password"`. Secret. */
  password: secretText,
  /** `auth: "key-contents"`. A private key pasted into the app, written to a private temp file. Secret. */
  privateKey: secretText,
  /** Where the agent's commands start. Empty means the login directory. */
  defaultDirectory: Schema.String.check(Schema.isMaxLength(512)).pipe(
    Schema.withDecodingDefault(Effect.succeed("")),
  ),
  agentAccess: SshServerAgentAccess.pipe(
    Schema.withDecodingDefault(Effect.succeed("off" as const)),
  ),
  createdAt: Schema.optional(Schema.Int),
});
export type SshServer = typeof SshServer.Type;

export const SshServers = Schema.Array(SshServer).check(
  Schema.isMaxLength(SSH_SERVER_MAX_COUNT),
  Schema.makeFilter(
    (servers) =>
      new Set(servers.map((server) => server.id)).size === servers.length ||
      "Ssh server ids must be unique.",
  ),
);
export type SshServers = typeof SshServers.Type;

/** One server, addressed by the stable id the user's settings carry. */
export const SshServerTarget = Schema.Struct({
  server: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
});

/**
 * A saved server as a client or an agent sees it: everything needed to pick one,
 * and whether a credential exists — never the credential.
 */
export const SshServerSummary = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  host: TrimmedNonEmptyString,
  port: Schema.NullOr(Schema.Int),
  username: Schema.NullOr(Schema.String),
  auth: SshServerAuth,
  agentAccess: SshServerAgentAccess,
  hasPassword: Schema.Boolean,
  hasPrivateKey: Schema.Boolean,
});
export type SshServerSummary = typeof SshServerSummary.Type;

/** What one non-interactive command on a saved server produced. */
export const SshCommandOutput = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  host: TrimmedNonEmptyString,
  command: Schema.String,
  stdout: Schema.String,
  stderr: Schema.String,
  truncated: Schema.Boolean,
  elapsedMs: Schema.Int,
});
export type SshCommandOutput = typeof SshCommandOutput.Type;

/**
 * What a successful connection test reports. The fingerprint is the host key
 * the connection trusted, so the user can compare it with what the server
 * administrator published.
 */
export const SshConnectionReport = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  /** The remote hostname ssh reports (`hostname` from `ssh -G`). */
  hostname: TrimmedNonEmptyString,
  username: Schema.NullOr(Schema.String),
  port: Schema.NullOr(Schema.Int),
  /** `uname -sr` on the remote, or null when it could not be read. */
  system: Schema.NullOr(Schema.String),
  /** Seconds the connection took. */
  elapsedMs: Schema.Int,
});
export type SshConnectionReport = typeof SshConnectionReport.Type;

export const SshError = Schema.TaggedStruct("SshError", {
  code: Schema.Literals([
    "not_found",
    "not_configured",
    "access_denied",
    "connect_failed",
    "auth_failed",
    "host_key",
    "command_failed",
    "timeout",
  ]),
  message: TrimmedNonEmptyString,
});
export type SshError = typeof SshError.Type;
