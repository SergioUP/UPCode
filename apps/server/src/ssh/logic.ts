/**
 * The small decisions behind the Vault's SSH section, kept separate from the
 * process work so they can be tested without an SSH server.
 *
 * The one that matters: a saved server has *two* secret fields, and neither is
 * ever part of a summary an agent or a client sees.
 *
 * @module ssh/logic
 */

import {
  SETTINGS_SECRET_REDACTED,
  type SshServer,
  type SshServerSummary,
} from "@upcode/contracts";

/** Past this the answer stops being something a person or a model can read. */
export const MAX_SSH_OUTPUT_CHARS = 20_000;

/** How much an agent may do, lowest first. */
export const sshAccessRank: Readonly<Record<SshServer["agentAccess"], number>> = {
  off: 0,
  "read-only": 1,
  commands: 2,
};

/**
 * A stored credential arrives as the redaction marker, never as the value. An
 * empty string means "nothing saved", which is different from "saved and hidden".
 */
export function hasSecretValue(value: string | undefined): boolean {
  return value !== undefined && value.length > 0 && value !== SETTINGS_SECRET_REDACTED;
}

/**
 * Finds a saved server by id or by label, case-insensitively, because the user
 * names it out loud ("el de lotes") and the agent only has that name.
 */
export function resolveSavedServer(
  servers: ReadonlyArray<SshServer>,
  reference: string,
): SshServer | undefined {
  const wanted = reference.trim();
  if (wanted.length === 0) return undefined;
  const byId = servers.find((server) => server.id === wanted);
  if (byId !== undefined) return byId;
  const lowered = wanted.toLowerCase();
  return servers.find((server) => server.label.toLowerCase() === lowered);
}

/** Whether `actual` allows at least `required`. Unknown values fail closed. */
export function allowsAccess(
  actual: SshServer["agentAccess"],
  required: SshServer["agentAccess"],
): boolean {
  const actualRank = sshAccessRank[actual];
  const requiredRank = sshAccessRank[required];
  if (actualRank === undefined || requiredRank === undefined) return false;
  return actualRank >= requiredRank;
}

/** What a client or an agent may know about a server: never the credential. */
export function toServerSummary(server: SshServer): SshServerSummary {
  return {
    id: server.id,
    label: server.label,
    host: server.host,
    port: server.port ?? null,
    username: server.username.length > 0 ? server.username : null,
    auth: server.auth,
    agentAccess: server.agentAccess,
    hasPassword: hasSecretValue(server.password),
    hasPrivateKey: hasSecretValue(server.privateKey),
  };
}

/** Caps output and says so, so nobody mistakes a cut answer for the whole one. */
export function trimSshOutput(value: string): {
  readonly text: string;
  readonly truncated: boolean;
} {
  return value.length > MAX_SSH_OUTPUT_CHARS
    ? { text: `${value.slice(0, MAX_SSH_OUTPUT_CHARS)}\n[truncated]`, truncated: true }
    : { text: value, truncated: false };
}
