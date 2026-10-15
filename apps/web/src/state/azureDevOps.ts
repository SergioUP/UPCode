import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

export const azureDevOps = {
  config: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:config",
    tag: WS_METHODS.azureDevOpsConfig,
  }),
  projects: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:projects",
    tag: WS_METHODS.azureDevOpsListProjects,
  }),
  workItems: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:work-items",
    tag: WS_METHODS.azureDevOpsListWorkItems,
  }),
  myWorkItems: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:my-work-items",
    tag: WS_METHODS.azureDevOpsMyWorkItems,
  }),
  azCliStatus: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:az-cli-status",
    tag: WS_METHODS.azureDevOpsAzCliStatus,
  }),
  azCliOpen: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "azure-devops:az-cli-open",
    tag: WS_METHODS.azureDevOpsAzCliOpen,
  }),
  workItem: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:work-item",
    tag: WS_METHODS.azureDevOpsGetWorkItem,
  }),
  repositories: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:repositories",
    tag: WS_METHODS.azureDevOpsListRepositories,
  }),
  branches: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:branches",
    tag: WS_METHODS.azureDevOpsListBranches,
  }),
  pullRequests: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:pull-requests",
    tag: WS_METHODS.azureDevOpsListPullRequests,
  }),
  pullRequestDetail: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:pull-request-detail",
    tag: WS_METHODS.azureDevOpsGetPullRequestDetail,
  }),
  threadLinks: createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
    label: "azure-devops:thread-links",
    tag: WS_METHODS.azureDevOpsThreadLinks,
  }),
  updateWorkItem: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "azure-devops:update-work-item",
    tag: WS_METHODS.azureDevOpsUpdateWorkItem,
  }),
  linkThread: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "azure-devops:link-thread",
    tag: WS_METHODS.azureDevOpsLinkThread,
  }),
};
