import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  buildUPCodeProjectFileJsonSchema,
  parseUPCodeProjectFile,
  UPCodeProjectFileFromJson,
} from "./upcodeProjectFile.ts";

const decodeJson = Schema.decodeUnknownSync(UPCodeProjectFileFromJson);

describe("buildUPCodeProjectFileJsonSchema", () => {
  it("emits a draft 2020-12 schema with the published $id", () => {
    const schema = buildUPCodeProjectFileJsonSchema();

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe("https://upcode.codes/schema/upcode.json");
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
  });

  it("documents every supported field", () => {
    const schema = buildUPCodeProjectFileJsonSchema() as {
      properties: Record<
        string,
        {
          description?: string;
          items?: { properties: Record<string, unknown>; required: ReadonlyArray<string> };
        }
      >;
      required?: ReadonlyArray<string>;
    };

    expect(Object.keys(schema.properties).sort()).toEqual([
      "$schema",
      "defaultThreadEnvMode",
      "iconPath",
      "scripts",
      "worktreeSubmodules",
    ]);
    expect(schema.required).toBeUndefined();
    expect(schema.properties.iconPath?.description).toContain("Workspace-relative path");
    expect(schema.properties.defaultThreadEnvMode?.description).toContain("new threads start");

    const script = schema.properties.scripts?.items;
    expect(script?.required).toEqual(["name", "command"]);
    expect(Object.keys(script?.properties ?? {}).sort()).toEqual([
      "async",
      "autoOpenPreview",
      "command",
      "icon",
      "name",
      "previewUrl",
      "runOnSettle",
      "runOnWorktreeCreate",
    ]);
  });

  it("stays JSON-serializable", () => {
    const schema = buildUPCodeProjectFileJsonSchema();
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});

describe("UPCodeProjectFileFromJson", () => {
  it("decodes lenient JSONC with comments and trailing commas", () => {
    const decoded = decodeJson(`{
      // team scripts
      "iconPath": "assets/logo.svg",
      "scripts": [
        { "name": "Dev", "command": "pnpm dev", },
      ],
    }`);

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts?.[0]).toEqual({ name: "Dev", command: "pnpm dev" });
  });

  it("fails on malformed JSON", () => {
    expect(() => decodeJson("{ not json")).toThrow();
  });
});

describe("parseUPCodeProjectFile", () => {
  it("returns the decoded file for valid contents", () => {
    expect(parseUPCodeProjectFile('{ "defaultThreadEnvMode": "worktree" }')).toEqual({
      defaultThreadEnvMode: "worktree",
    });
  });

  it("returns null for malformed or invalid contents", () => {
    expect(parseUPCodeProjectFile("{ not json")).toBeNull();
    expect(parseUPCodeProjectFile('{ "defaultThreadEnvMode": "spaceship" }')).toBeNull();
  });
});
