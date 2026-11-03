import { describe, expect, it } from "vite-plus/test";
import { SETTINGS_SECRET_REDACTED, type SshServer } from "@t3tools/contracts";

import {
  allowsAccess,
  hasSecretValue,
  MAX_SSH_OUTPUT_CHARS,
  resolveSavedServer,
  toServerSummary,
  trimSshOutput,
} from "./logic.ts";

const server = (overrides: Partial<SshServer> = {}): SshServer => ({
  id: "lotes-prod",
  label: "Lotes producción",
  host: "10.0.0.12",
  port: 2222,
  username: "deploy",
  auth: "password",
  identityFile: "",
  password: "s3cret",
  privateKey: "",
  defaultDirectory: "",
  agentAccess: "read-only",
  ...overrides,
});

describe("resolveSavedServer", () => {
  it("finds a server by id and by label, ignoring case and spaces", () => {
    const servers = [server()];

    expect(resolveSavedServer(servers, "lotes-prod")?.id).toBe("lotes-prod");
    expect(resolveSavedServer(servers, "  Lotes Producción ")?.id).toBe("lotes-prod");
  });

  it("returns undefined for an empty or unknown name", () => {
    const servers = [server()];

    expect(resolveSavedServer(servers, "")).toBeUndefined();
    expect(resolveSavedServer(servers, "   ")).toBeUndefined();
    expect(resolveSavedServer(servers, "otro")).toBeUndefined();
    expect(resolveSavedServer([], "lotes-prod")).toBeUndefined();
  });
});

describe("allowsAccess", () => {
  it("orders off below read-only below commands", () => {
    expect(allowsAccess("off", "read-only")).toBe(false);
    expect(allowsAccess("read-only", "read-only")).toBe(true);
    expect(allowsAccess("read-only", "commands")).toBe(false);
    expect(allowsAccess("commands", "read-only")).toBe(true);
    expect(allowsAccess("commands", "commands")).toBe(true);
  });

  it("fails closed for a value it does not know", () => {
    expect(allowsAccess("unknown" as never, "read-only")).toBe(false);
  });
});

describe("hasSecretValue", () => {
  it("treats an empty field and the redaction marker as unsaved", () => {
    expect(hasSecretValue("")).toBe(false);
    expect(hasSecretValue(undefined)).toBe(false);
    expect(hasSecretValue(SETTINGS_SECRET_REDACTED)).toBe(false);
    expect(hasSecretValue("s3cret")).toBe(true);
  });
});

describe("toServerSummary", () => {
  it("says whether a credential exists without ever carrying it", () => {
    const summary = toServerSummary(server());

    expect(summary).toEqual({
      id: "lotes-prod",
      label: "Lotes producción",
      host: "10.0.0.12",
      port: 2222,
      username: "deploy",
      auth: "password",
      agentAccess: "read-only",
      hasPassword: true,
      hasPrivateKey: false,
    });
    expect(Object.keys(summary)).not.toContain("password");
    expect(Object.keys(summary)).not.toContain("privateKey");
    expect(JSON.stringify(summary)).not.toContain("s3cret");
  });

  it("does not claim a credential when the field only holds the redaction marker", () => {
    const summary = toServerSummary(server({ password: SETTINGS_SECRET_REDACTED, username: "" }));

    // The marker is what a client sees, never a usable value: the server
    // materializes the real one before a summary is built.
    expect(summary.hasPassword).toBe(false);
    expect(summary.username).toBeNull();
    expect(summary.port).toBe(2222);
  });
});

describe("trimSshOutput", () => {
  it("leaves a short answer alone", () => {
    expect(trimSshOutput("hola")).toEqual({ text: "hola", truncated: false });
  });

  it("cuts a long answer and says so", () => {
    const result = trimSshOutput("x".repeat(MAX_SSH_OUTPUT_CHARS + 10));

    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("[truncated]")).toBe(true);
    expect(result.text.length).toBeLessThan(MAX_SSH_OUTPUT_CHARS + 20);
  });
});
