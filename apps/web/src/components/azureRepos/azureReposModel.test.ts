import { describe, expect, it } from "vite-plus/test";
import type { AzureDevOpsPullRequest } from "@t3tools/contracts";
import { latestCreation, relativeDate, reviewState } from "./azureReposModel";

const pr: AzureDevOpsPullRequest = {
  id: 1,
  repositoryId: "repo",
  title: "Change",
  status: "active",
  sourceBranch: "feature",
  targetBranch: "main",
  url: "",
  createdBy: "Author",
  isDraft: false,
};

describe("Azure Repos review summaries", () => {
  it("keeps a required reviewer pending even when another reviewer approves", () => {
    expect(
      reviewState({
        ...pr,
        reviewers: [
          { name: "A", vote: 10, required: false },
          { name: "B", vote: 0, required: true },
        ],
      }).label,
    ).toBe("En revisión");
    expect(
      reviewState({
        ...pr,
        reviewers: [
          { name: "A", vote: 10, required: true },
          { name: "B", vote: -5, required: false },
        ],
      }).label,
    ).toBe("Cambios solicitados");
    expect(
      reviewState({ ...pr, isDraft: true, reviewers: [{ name: "A", vote: 10, required: true }] })
        .label,
    ).toBe("Borrador");
  });
  it("does not manufacture activity dates for missing or invalid timestamps", () => {
    expect(
      latestCreation([
        { ...pr, createdAt: "invalid" },
        { ...pr, createdAt: null },
      ]),
    ).toBeNull();
    expect(relativeDate("invalid")).toBe("—");
    expect(relativeDate("2026-11-10T10:00:00Z", Date.parse("2026-11-10T12:00:00Z"))).toBe(
      "hace 2 h",
    );
  });
});
