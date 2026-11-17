import { describe, expect, it } from "vite-plus/test";

import {
  pullRequestThreadDisplayStatus,
  pullRequestThreadStatusLabel,
} from "./pullRequestThreadStatus.logic";

describe("pullRequestThreadDisplayStatus", () => {
  it("prefers the host's own state", () => {
    expect(pullRequestThreadDisplayStatus({ status: "wontFix", isResolved: true })).toBe("wontFix");
  });

  it("falls back to the two-state toggle", () => {
    expect(pullRequestThreadDisplayStatus({ isResolved: true })).toBe("fixed");
    expect(pullRequestThreadDisplayStatus({ isResolved: false })).toBe("active");
  });
});

describe("pullRequestThreadStatusLabel", () => {
  it("names every Azure DevOps state", () => {
    expect(
      (["active", "pending", "fixed", "wontFix", "closed", "byDesign"] as const).map(
        pullRequestThreadStatusLabel,
      ),
    ).toEqual(["Active", "Pending", "Resolved", "Won't fix", "Closed", "By design"]);
  });
});
