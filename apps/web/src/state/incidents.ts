import { WS_METHODS } from "@t3tools/contracts";
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
};
