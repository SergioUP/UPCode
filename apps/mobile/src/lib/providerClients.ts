import { isProviderDriverKind } from "@upcode/contracts";
import { acpRegistryClient } from "@upcode/provider-acp-registry/client";
import { makeProviderClientRegistry } from "@upcode/provider-core/client";
import { cursorClient } from "@upcode/provider-cursor/client";
import { grokClient } from "@upcode/provider-grok/client";
import { museClient } from "@upcode/provider-muse/client";
import { openCodeClient } from "@upcode/provider-opencode/client";
import { piClient } from "@upcode/provider-pi/client";

/** The provider client definitions this mobile build ships. */
const providerClients = makeProviderClientRegistry([
  cursorClient,
  grokClient,
  museClient,
  openCodeClient,
  piClient,
  acpRegistryClient,
]);

/** The client definition for a driver kind, or `undefined` for drivers drawn by hand. */
export function getProviderClient(driver: string | null | undefined) {
  return isProviderDriverKind(driver) ? providerClients.get(driver) : undefined;
}
