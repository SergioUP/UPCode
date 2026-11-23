import { ProviderInstanceId, RunId, ThreadId } from "@upcode/contracts";
import { describe, expect, it } from "vitest";

import { agentBarStatus } from "./AgentBarCoordinator";

const startedAt = "2026-11-20T10:00:00.000Z";
const completedAt = "2026-11-20T10:05:00.000Z";
const thread = {
  archivedAt: null,
  settledOverride: null,
  lineage: {
    parentThreadId: null,
    relationshipToParent: null,
    rootThreadId: ThreadId.make("root-thread"),
  },
  runtime: null,
  latestRun: {
    runId: RunId.make("run"),
    status: "completed",
    assistantMessageId: null,
    requestedAt: startedAt,
    startedAt,
    completedAt,
  },
  lastVisitedAt: startedAt,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  interactionMode: "default",
} satisfies Parameters<typeof agentBarStatus>[0];

describe("Agent Bar", () => {
  it("hides settled threads even when their last completion is unread", () => {
    expect(agentBarStatus({ ...thread, settledOverride: "settled" }, undefined)).toBeNull();
    expect(
      agentBarStatus({ ...thread, settledOverride: "settled", latestRun: null }, undefined),
    ).toBeNull();
    expect(agentBarStatus({ ...thread, settledOverride: "active" }, undefined)).toBe("done");
  });

  it("clears the completion badge but keeps reviewed open threads in the bar", () => {
    expect(agentBarStatus(thread, completedAt)).toBe("done");
    expect(agentBarStatus({ ...thread, lastVisitedAt: completedAt }, startedAt)).toBe("idle");
    expect(agentBarStatus({ ...thread, lastVisitedAt: undefined }, startedAt)).toBe("done");
  });

  it("shows attention over a previous completion and omits archived threads and subagents", () => {
    expect(agentBarStatus({ ...thread, hasPendingUserInput: true }, undefined)).toBe("input");
    expect(agentBarStatus({ ...thread, hasPendingApprovals: true }, undefined)).toBe("approval");
    expect(agentBarStatus({ ...thread, archivedAt: completedAt }, undefined)).toBeNull();
    expect(
      agentBarStatus(
        {
          ...thread,
          lineage: { ...thread.lineage, relationshipToParent: "subagent" },
        },
        undefined,
      ),
    ).toBeNull();
  });

  it("distinguishes a failed run from a thread that has never run", () => {
    expect(
      agentBarStatus(
        { ...thread, latestRun: { ...thread.latestRun, status: "failed" } },
        undefined,
      ),
    ).toBe("failed");
    expect(agentBarStatus({ ...thread, latestRun: null }, undefined)).toBe("idle");
  });

  it("does not show a parked provider session as waiting for work", () => {
    const runtime = {
      status: "idle" as const,
      activeRunId: null,
      providerInstanceId: ProviderInstanceId.make("codex"),
      providerName: "Codex",
      lastError: null,
      updatedAt: completedAt,
    };
    expect(agentBarStatus({ ...thread, runtime }, undefined)).toBe("done");
    expect(agentBarStatus({ ...thread, runtime, lastVisitedAt: completedAt }, undefined)).toBe(
      "idle",
    );
  });
});
