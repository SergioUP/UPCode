import { assert, describe, it } from "@effect/vitest";

import {
  UPCODE_ORCHESTRATION_INSTRUCTIONS,
  upcodeAcpPromptWithInstructions,
  upcodeOrchestrationPromptForFirstRun,
  upcodeOrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("UPCode orchestration provider instructions", () => {
  it("distinguishes delegated subagents from ordinary top-level threads", () => {
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "Use `delegate_task`");
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "ordinary top-level UPCode conversations");
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "Never use them merely");
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "cross-provider");
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "call `delegate_task` again");
    assert.include(
      UPCODE_ORCHESTRATION_INSTRUCTIONS,
      "Do not use `upcode_thread_send` on `childThreadId`",
    );
  });

  it("documents structured schedules instead of JSON strings", () => {
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "structured object, never as JSON text");
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, '"everyMs":3600000');
    assert.include(UPCODE_ORCHESTRATION_INSTRUCTIONS, "bindToCurrentThread=false");
  });

  it("injects prompt fallback only for an MCP-enabled first run", () => {
    const prompt = "Inspect the repository.";
    const injected = upcodeOrchestrationPromptForFirstRun({
      prompt,
      runOrdinal: 1,
      hasUPCodeMcp: true,
    });

    assert.include(injected, "<upcode_code_orchestration_instructions>");
    assert.include(injected, `<user_request>\n${prompt}\n</user_request>`);
    assert.equal(
      upcodeOrchestrationPromptForFirstRun({ prompt, runOrdinal: 2, hasUPCodeMcp: true }),
      prompt,
    );
    assert.equal(
      upcodeOrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, hasUPCodeMcp: false }),
      prompt,
    );
  });

  it("only exposes the system prompt when the UPCode MCP server is attached", () => {
    assert.equal(upcodeOrchestrationSystemPrompt(false), undefined);
    assert.equal(upcodeOrchestrationSystemPrompt(true), UPCODE_ORCHESTRATION_INSTRUCTIONS);
  });

  it("gives ACP sessions provider-neutral mode, browser, and orchestration guidance", () => {
    const injected = upcodeAcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", hasUPCodeMcp: true },
    });

    assert.include(injected, "UPCode interaction mode: Default");
    assert.include(injected, "UPCode collaborative browser");
    assert.include(injected, "UPCode orchestration");
    assert.include(injected, "<user_request>\nInspect the repository.\n</user_request>");
  });

  it("reinjects ACP guidance only when mode or tool availability changes", () => {
    const prompt = "Continue.";
    const defaultState = { interactionMode: "default", hasUPCodeMcp: true } as const;

    assert.equal(
      upcodeAcpPromptWithInstructions({ prompt, state: defaultState, previousState: defaultState }),
      prompt,
    );
    assert.include(
      upcodeAcpPromptWithInstructions({
        prompt,
        state: { ...defaultState, interactionMode: "plan" },
        previousState: defaultState,
      }),
      "UPCode interaction mode: Plan",
    );
    const withoutMcp = upcodeAcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", hasUPCodeMcp: false },
    });
    assert.include(withoutMcp, "UPCode interaction mode: Default");
    assert.notInclude(withoutMcp, "UPCode collaborative browser");
    assert.notInclude(withoutMcp, "UPCode orchestration");
  });
});
