import { describe, expect, it } from "vite-plus/test";

import { AzureDevOpsToolkit } from "./tools.ts";

describe("azure devops toolkit registration", () => {
  it("registers the four work item tools under the names the agent calls", () => {
    expect(Object.keys(AzureDevOpsToolkit.tools).sort()).toEqual([
      "azure_devops_link_thread",
      "azure_devops_my_work_items",
      "azure_devops_unlink_thread",
      "azure_devops_work_item",
    ]);
  });

  it("tells the agent not to guess between several active tasks", () => {
    const description = AzureDevOpsToolkit.tools.azure_devops_my_work_items.description;

    expect(description).toContain("Never pick one of several active items");
  });
});
