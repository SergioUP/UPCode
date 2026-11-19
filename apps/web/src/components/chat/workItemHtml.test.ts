// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { workItemHtml } from "./workItemHtml";

describe("work item rich text", () => {
  it("formats Azure comments instead of displaying tags", () => {
    const element = document.createElement("div");
    element.innerHTML = workItemHtml(
      "<div>Hola <strong>equipo</strong></div><ul><li>Revisar</li></ul>",
    );
    expect(element.querySelector("strong")?.textContent).toBe("equipo");
    expect(element.querySelector("li")?.textContent).toBe("Revisar");
    expect(element.textContent).not.toContain("<div>");
  });
  it("renders markdown and preserves plain text line breaks", () => {
    expect(workItemHtml("**Hecho**")).toContain("<strong>Hecho</strong>");
    expect(workItemHtml("Uno\nDos")).toBe("Uno<br>Dos");
  });
  it("removes executable content and unsafe links", () => {
    const html = workItemHtml(
      '<p onclick="alert(1)">Texto<script>alert(1)</script></p><a href="javascript:alert(1)">mal</a><a href="https://example.com">bien</a>',
    );
    expect(html).not.toMatch(/script|onclick/);
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain("<a>mal</a>");
  });
});
