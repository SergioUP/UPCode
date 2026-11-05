import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_SERVER_SETTINGS,
  SETTINGS_SECRET_REDACTED,
  type ServerSettings,
} from "@upcode/contracts";

import { mapSettingsSecrets, SECRET_REDACTED } from "../settingsSecrets.ts";
import { sshServerSecretName } from "./sshServerSecrets.ts";

/**
 * The Vault's promise: a saved password lives in the secret store and the
 * settings file — and therefore every client — only carries the redaction
 * marker. This is the wiring that has to stay true for the `ssh_*` tools, which
 * read the materialized value from settings.
 */
const settingsWithServer = (password: string): ServerSettings => ({
  ...DEFAULT_SERVER_SETTINGS,
  sshServers: [
    {
      id: "lotes-prod",
      label: "Lotes producción",
      host: "10.0.0.12",
      username: "deploy",
      auth: "password",
      identityFile: "",
      password,
      privateKey: "",
      defaultDirectory: "",
      agentAccess: "read-only",
    },
  ],
});

describe("ssh server credentials in settings", () => {
  it("moves a typed password into the secret store and leaves the marker behind", () => {
    const written = new Map<string, string>();
    const persisted = mapSettingsSecrets(settingsWithServer("s3cret"), (secret) => {
      written.set(secret.secretName, secret.value);
      return { value: "", redacted: true };
    });

    expect(written.get(sshServerSecretName({ id: "lotes-prod", field: "password" }))).toBe(
      "s3cret",
    );
    expect(persisted.sshServers[0]?.password).toBe(SECRET_REDACTED);
    expect(SECRET_REDACTED).toBe(SETTINGS_SECRET_REDACTED);
  });

  it("keeps the stored value when a client sends the marker back", () => {
    const written = new Map<string, string>();
    const persisted = mapSettingsSecrets(settingsWithServer(SETTINGS_SECRET_REDACTED), (secret) => {
      written.set(secret.secretName, secret.value);
      return { value: "", redacted: true };
    });

    // The marker is what a client sent, not a credential: nothing new is written.
    expect(written.get(sshServerSecretName({ id: "lotes-prod", field: "password" }))).toBe(
      SETTINGS_SECRET_REDACTED,
    );
    expect(persisted.sshServers[0]?.password).toBe(SECRET_REDACTED);
  });

  it("keys each server's credential by its own id", () => {
    const base = settingsWithServer("").sshServers[0]!;
    const names = new Set<string>();
    mapSettingsSecrets(
      {
        ...settingsWithServer(""),
        sshServers: [
          { ...base, id: "uno", password: "a" },
          { ...base, id: "dos", password: "b" },
        ],
      },
      (secret) => {
        names.add(secret.secretName);
        return { value: "", redacted: true };
      },
    );

    expect(names.has(sshServerSecretName({ id: "uno", field: "password" }))).toBe(true);
    expect(names.has(sshServerSecretName({ id: "dos", field: "password" }))).toBe(true);
  });
});
