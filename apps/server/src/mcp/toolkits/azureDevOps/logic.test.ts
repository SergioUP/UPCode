import type { AzureDevOpsWorkItem } from "@upcode/contracts";
import { describe, expect, it } from "vite-plus/test";

import { findProjectForWorkItem, isActiveState, plainText, summarizeWorkItem } from "./logic.ts";

function item(overrides: Partial<AzureDevOpsWorkItem> = {}): AzureDevOpsWorkItem {
  return {
    id: 7766,
    project: "Proyecto Demo",
    title: "Revisar el pipeline",
    type: "Agile.Task",
    state: "Active",
    assignedTo: "Sergio Moreno",
    iteration: "12.10-23.10-26",
    description: null,
    url: "https://dev.azure.com/organizacion/_workitems/edit/7766",
    changedAt: "2026-11-02T09:00:00Z",
    ...overrides,
  };
}

describe("azure devops toolkit logic", () => {
  it("treats finished states as closed, whatever the process calls them", () => {
    expect(isActiveState("Active")).toBe(true);
    expect(isActiveState("StandBy Client")).toBe(true);
    expect(isActiveState("Ready for Test")).toBe(true);
    expect(isActiveState("Closed")).toBe(false);
    expect(isActiveState("done")).toBe(false);
    expect(isActiveState(" Removed ")).toBe(false);
  });

  it("summarises without dragging the whole card along", () => {
    const summary = summarizeWorkItem(item({ area: "Area\\Subarea", comments: [], fields: [] }));

    expect(summary).toEqual({
      id: 7766,
      project: "Proyecto Demo",
      title: "Revisar el pipeline",
      type: "Agile.Task",
      state: "Active",
      assignedTo: "Sergio Moreno",
      iteration: "12.10-23.10-26",
      area: "Area\\Subarea",
      url: "https://dev.azure.com/organizacion/_workitems/edit/7766",
      changedAt: "2026-11-02T09:00:00Z",
    });
    // The description and the comments are not part of the summary.
    expect("description" in summary).toBe(false);
    expect("comments" in summary).toBe(false);
  });

  it("strips Azure's HTML down to words and clips it", () => {
    expect(plainText("<p>Hola <b>mundo</b></p><ul><li>uno</li></ul>")).toBe("Hola mundo\nuno");
    expect(plainText(null)).toBeNull();
    expect(plainText("<p></p>")).toBeNull();
    const long = plainText(`<p>${"a".repeat(50)}</p>`, 10);
    expect(long).toBe(`${"a".repeat(10)}…`);
  });

  it("resolves a project only from the caller's own assignments", () => {
    const items = [item(), item({ id: 7800, project: "Shopify" })];

    expect(findProjectForWorkItem(items, 7766)).toBe("Proyecto Demo");
    expect(findProjectForWorkItem(items, 7800)).toBe("Shopify");
    // An id nobody assigned is not guessed: the agent has to ask for the project.
    expect(findProjectForWorkItem(items, 9999)).toBeNull();
  });
});
