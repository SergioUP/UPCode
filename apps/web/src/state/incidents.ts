import { ORCHESTRATION_V2_WS_METHODS, WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

export const incidents = {
  list: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "incidents:list",
    tag: WS_METHODS.incidentsList,
  }),
  mutate: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "incidents:mutate",
    tag: WS_METHODS.incidentsMutate,
  }),
  /** Launch the dedicated conversation an incident investigates in. */
  launchThread: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "incidents:launch-thread",
    tag: ORCHESTRATION_V2_WS_METHODS.launchThread,
  }),
};
