import { describe, expect, it } from "vite-plus/test";
import { getRenderablePatch } from "../../lib/diffRendering";
import { normalizeProviderPatch } from "./providerPatch";

describe("provider edit patches", () => {
  it("parses bare hunks with the original filename and source line numbers", () => {
    const result = getRenderablePatch(
      normalizeProviderPatch(
        "@@ -79,2 +79,2 @@\n-const old = true;\n+const next = false;\n context\n",
        "src/my component.tsx",
      ),
    );
    expect(result?.kind).toBe("files");
    if (result?.kind !== "files") throw new Error("Expected a renderable patch");
    expect(result.files[0]?.name).toBe("src/my component.tsx");
    expect(result.files[0]?.hunks[0]?.additionStart).toBe(79);
  });

  it("preserves full patches including deleted files and multiple file headers", () => {
    const patch = "--- a/old.cs\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n";
    expect(normalizeProviderPatch(patch, "other.cs")).toBe(patch);
  });

  it("normalizes legacy single headers and Windows paths for language detection", () => {
    const patch = normalizeProviderPatch(
      "--- App.cs\r\n@@ -1 +1 @@\r\n-old\r\n+new\r\n",
      "src\\App.cs",
    );
    const result = getRenderablePatch(patch);
    if (result?.kind !== "files") throw new Error("Expected a renderable patch");
    expect(result.files[0]?.name).toBe("src/App.cs");
  });

  it("keeps unsupported output available as raw text", () => {
    expect(normalizeProviderPatch("provider did not supply hunks", "App.cs")).toBe(
      "provider did not supply hunks",
    );
  });
});
