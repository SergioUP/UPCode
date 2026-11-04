import { describe, expect, it } from "vite-plus/test";

import { buildJiraJql, documentFromText, plainFromAdf } from "./jiraWorkspace.ts";

describe("buildJiraJql", () => {
  it("scopes the search to one project and orders by recency", () => {
    expect(buildJiraJql({ project: "TAREA", assignedToMe: false })).toBe(
      'project = "TAREA" ORDER BY updated DESC',
    );
  });

  it("narrows to the current user and escapes quotes", () => {
    expect(buildJiraJql({ project: 'UP"ANGO', assignedToMe: true })).toBe(
      'project = "UP\\"ANGO" AND assignee = currentUser() ORDER BY updated DESC',
    );
  });

  it("treats a key as a key and anything else as full-text", () => {
    expect(buildJiraJql({ project: "TAR", assignedToMe: false, query: "tarea-96" })).toContain(
      'AND key = "TAREA-96"',
    );
    expect(buildJiraJql({ project: "TAR", assignedToMe: false, query: "royalbio" })).toContain(
      'AND text ~ "royalbio"',
    );
  });

  it("never searches the whole site when the project is missing", () => {
    expect(buildJiraJql({ assignedToMe: false })).toBe('project = "EMPTY" ORDER BY updated DESC');
  });
});

describe("documentFromText", () => {
  it("turns each non-empty line into a paragraph", () => {
    expect(documentFromText("uno\n\ndos")).toEqual({
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "uno" }] },
        { type: "paragraph", content: [{ type: "text", text: "dos" }] },
      ],
    });
  });
});

describe("plainFromAdf", () => {
  it("flattens nested text nodes and joins them by line", () => {
    expect(
      plainFromAdf({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "hola" }] },
          { type: "paragraph", content: [{ type: "text", text: "adios" }] },
        ],
      }),
    ).toBe("hola\nadios");
  });

  it("returns nothing for junk", () => {
    expect(plainFromAdf(null)).toBe("");
    expect(plainFromAdf(42)).toBe("");
  });
});
