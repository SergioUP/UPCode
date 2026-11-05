import { describe, expect, it } from "vite-plus/test";

import { UPCODE_MCP_TOOL_NAMES, resolveUPCodeMcpToolPresentation } from "./upcodeMcpToolPresentation.ts";

describe("resolveUPCodeMcpToolPresentation", () => {
  it("recognizes every UPCode tool across provider prefixes and completion suffixes", () => {
    for (const tool of UPCODE_MCP_TOOL_NAMES) {
      const presentation = resolveUPCodeMcpToolPresentation(tool);
      for (const prefix of [
        "mcp__upcode__",
        "mcp__upcode_code__",
        "mcp__upcode__",
        "upcode.",
        "upcode_code/",
        "upcode:",
        "mcp_upcode_",
        "UPCode ",
        "upcode · ",
      ]) {
        expect(resolveUPCodeMcpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveUPCodeMcpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });
  it("pretty prints Claude and Cursor UPCode MCP tool names", () => {
    expect(resolveUPCodeMcpToolPresentation("mcp__upcode__upcode_thread_read")).toEqual({
      displayName: "Read a UPCode thread",
      logo: "upcode",
    });
  });

  it("pretty prints Codex UPCode MCP tool names", () => {
    expect(resolveUPCodeMcpToolPresentation("upcode.create_threads")).toEqual({
      displayName: "Create UPCode threads",
      logo: "upcode",
    });
  });

  it("pretty prints thread metadata updates", () => {
    expect(resolveUPCodeMcpToolPresentation("mcp__upcode__upcode_thread_update")).toEqual({
      displayName: "Update UPCode thread metadata",
      logo: "upcode",
    });
  });

  it("pretty prints bare UPCode MCP toolkit names", () => {
    expect(resolveUPCodeMcpToolPresentation("list_scheduled_tasks")).toEqual({
      displayName: "List scheduled tasks",
      logo: "upcode",
    });
  });

  it("pretty prints worktree UPCode MCP tool names", () => {
    expect(resolveUPCodeMcpToolPresentation("mcp__upcode__upcode_worktree_handoff")).toEqual({
      displayName: "Hand off thread to a git worktree",
      logo: "upcode",
    });
    expect(resolveUPCodeMcpToolPresentation("upcode.upcode_worktree_status")).toEqual({
      displayName: "Get thread worktree status",
      logo: "upcode",
    });
  });

  it("pretty prints preview UPCode MCP tool names", () => {
    expect(resolveUPCodeMcpToolPresentation("upcode.preview_open")).toEqual({
      displayName: "Open a page in the preview browser",
      logo: "upcode",
    });
    expect(resolveUPCodeMcpToolPresentation("mcp__upcode__preview_status")).toEqual({
      displayName: "Get preview browser status",
      logo: "upcode",
    });
  });

  it("matches the separator variants ACP registry agents emit", () => {
    for (const name of [
      "mcp_upcode_delegate_task",
      "upcode_code:delegate_task",
      "upcode/delegate_task",
      "upcode delegate_task",
      "UPCode delegate_task",
      "upcode__delegate_task",
    ]) {
      expect(resolveUPCodeMcpToolPresentation(name)?.displayName).toBe("Delegate a child task");
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveUPCodeMcpToolPresentation("upcode-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveUPCodeMcpToolPresentation("upcode-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });

  it("keeps unknown MCP tools on the generic renderer path", () => {
    expect(resolveUPCodeMcpToolPresentation("mcp__github__search_issues")).toBeNull();
    expect(resolveUPCodeMcpToolPresentation("upcode.not_a_real_tool")).toBeNull();
  });
});
