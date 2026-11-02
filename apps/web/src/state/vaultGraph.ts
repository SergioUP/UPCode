import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Scanning a vault is a deliberate, expensive read, so it is a command the
 * screen fires when asked, never a query that refetches on focus changes.
 */
export const vaultGraph = {
  scan: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "vault-graph:scan",
    tag: WS_METHODS.vaultGraphScan,
  }),
  /**
   * `filesystem.getMetadata` already answers "does this path exist and what is
   * it", which is all it takes to tell a vault root (the folder holding
   * `.obsidian`) from a random subfolder, without reading anything.
   */
  metadata: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "vault-graph:metadata",
    tag: WS_METHODS.filesystemGetMetadata,
  }),
};
