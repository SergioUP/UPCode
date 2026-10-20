import { describe, expect, it } from "vite-plus/test";

import { parsePatch, patchLineText } from "./pullRequestPatch";

const PATCH = [
  "diff --git a/src/uno.ts b/src/uno.ts",
  "index 111..222 100644",
  "--- a/src/uno.ts",
  "+++ b/src/uno.ts",
  "@@ -1,3 +1,4 @@",
  " const uno = 1;",
  "-const dos = 2;",
  "+const dos = 3;",
  "+const tres = 4;",
  " export { uno };",
  "diff --git a/src/nuevo.ts b/src/nuevo.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/nuevo.ts",
  "@@ -0,0 +1,1 @@",
  "+export const nuevo = true;",
  "diff --git a/src/viejo.ts b/src/viejo.ts",
  "deleted file mode 100644",
  "--- a/src/viejo.ts",
  "+++ /dev/null",
  "@@ -1,1 +0,0 @@",
  "-export const viejo = false;",
].join("\n");

describe("parsePatch", () => {
  it("reads each file with its fate and counts", () => {
    const files = parsePatch(PATCH);
    expect(files.map((file) => [file.path, file.status, file.additions, file.deletions])).toEqual([
      ["src/uno.ts", "modified", 2, 1],
      ["src/nuevo.ts", "new", 1, 0],
      ["src/viejo.ts", "deleted", 0, 1],
    ]);
  });

  it("classifies the lines a list draws differently", () => {
    const [modified] = parsePatch(PATCH);
    expect(modified?.lines.map((line) => line.kind)).toEqual([
      "meta",
      "meta",
      "meta",
      "hunk",
      "context",
      "delete",
      "add",
      "add",
      "context",
    ]);
    const added = modified?.lines.find((line) => line.kind === "add");
    expect(added && patchLineText(added)).toBe("const dos = 3;");
  });

  it("keeps the old path of a rename", () => {
    const [renamed] = parsePatch(
      [
        "diff --git a/src/antes.ts b/src/despues.ts",
        "similarity index 90%",
        "rename from src/antes.ts",
        "rename to src/despues.ts",
      ].join("\n"),
    );
    expect(renamed?.status).toBe("renamed");
    expect(renamed?.path).toBe("src/despues.ts");
    expect(renamed?.previousPath).toBe("src/antes.ts");
  });

  it("survives an empty patch", () => {
    expect(parsePatch("")).toEqual([]);
  });
});
