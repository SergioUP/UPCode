import { describe, expect, it } from "vite-plus/test";

import { isMarkdownDescription, normalizeDescriptionMarkdown } from "./workItemMarkdown";

describe("isMarkdownDescription", () => {
  it("recognises headings, lists, tables and emphasis", () => {
    expect(isMarkdownDescription("### Objetivo\nGuardar la versión")).toBe(true);
    expect(isMarkdownDescription("- uno\n- dos")).toBe(true);
    expect(isMarkdownDescription("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
    expect(isMarkdownDescription("usa **negrita** aquí")).toBe(true);
  });

  it("leaves Azure's own HTML and plain text alone", () => {
    expect(isMarkdownDescription("<div>Hola <b>mundo</b></div>")).toBe(false);
    expect(isMarkdownDescription("<p>### no es un título</p>")).toBe(false);
    expect(isMarkdownDescription("Sin formato, solo una frase.")).toBe(false);
  });
});

describe("normalizeDescriptionMarkdown", () => {
  it("turns an unbalanced ***text* paragraph into italic", () => {
    expect(normalizeDescriptionMarkdown("***La versión no se configura.*")).toBe(
      "*La versión no se configura.*",
    );
  });

  it("keeps real bold italic", () => {
    expect(normalizeDescriptionMarkdown("***ambas***")).toBe("***ambas***");
  });
});
