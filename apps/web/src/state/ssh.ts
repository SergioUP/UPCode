import { WS_METHODS } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Testing a saved server is a deliberate action: it opens a real SSH connection
 * with the stored credentials, so it runs when the user asks, never on render.
 */
export const ssh = {
  testServer: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "ssh:test-server",
    tag: WS_METHODS.sshTestServer,
  }),
};
