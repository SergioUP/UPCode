import type { Subagent } from "@upcode/contracts";
import { describe, expect, it } from "vite-plus/test";

import { composeSubagentTask, findSubagent } from "./subagentLogic.ts";

function subagent(overrides: Partial<Subagent> = {}): Subagent {
  return {
    id: "subagent-reviewer",
    name: "Revisor",
    prompt: "Revisas cambios y devuelves hallazgos ordenados por gravedad.",
    icon: "shield-check",
    hue: 152,
    tools: ["terminal"],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("subagent lookup", () => {
  const subagents = [subagent(), subagent({ id: "subagent-docs", name: "Documentador" })];

  it("finds a role by id and by name, ignoring case", () => {
    expect(findSubagent(subagents, "subagent-docs")?.name).toBe("Documentador");
    expect(findSubagent(subagents, "revisor")?.id).toBe("subagent-reviewer");
    expect(findSubagent(subagents, "  Documentador ")?.id).toBe("subagent-docs");
  });

  it("returns nothing rather than guessing a role", () => {
    expect(findSubagent(subagents, "Arquitecto")).toBeUndefined();
  });
});

describe("subagent brief", () => {
  it("carries the role, its tools and the task into the child prompt", () => {
    const task = composeSubagentTask(subagent(), "Revisa el diff de la rama actual.");

    expect(task).toContain('You are "Revisor"');
    expect(task).toContain("hallazgos ordenados por gravedad");
    expect(task).toContain("Tools this role should use: terminal.");
    expect(task).toContain("Task:\nRevisa el diff de la rama actual.");
  });

  it("still produces a usable brief when the role has no prompt or tools", () => {
    const task = composeSubagentTask(subagent({ prompt: "  ", tools: [] }), "Haz algo.");

    expect(task).toContain("No further instructions were written for this role.");
    expect(task).not.toContain("Tools this role should use");
    expect(task).toContain("Task:\nHaz algo.");
  });
});
