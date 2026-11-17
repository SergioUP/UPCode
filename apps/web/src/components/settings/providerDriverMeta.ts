import {
  AntigravitySettings,
  ClaudeSettings,
  CodexSettings,
  ProviderDriverKind,
} from "@upcode/contracts";
import { acpRegistryClient } from "@upcode/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@upcode/provider-core/client";
import { cursorClient } from "@upcode/provider-cursor/client";
import { grokClient } from "@upcode/provider-grok/client";
import { museClient } from "@upcode/provider-muse/client";
import { openCodeClient } from "@upcode/provider-opencode/client";
import { piClient } from "@upcode/provider-pi/client";

/** The provider client definitions this web build ships, in presentation order. */
export const providerClients = makeProviderClientRegistry([
  {
    driverKind: ProviderDriverKind.make("codex"),
    label: "Codex",
    settingsSchema: CodexSettings,
  },
  {
    driverKind: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    settingsSchema: ClaudeSettings,
  },
  cursorClient,
  grokClient,
  openCodeClient,
  {
    driverKind: ProviderDriverKind.make("antigravity"),
    label: "Antigravity",
    settingsSchema: AntigravitySettings,
  },
  museClient,
  piClient,
  acpRegistryClient,
]);
