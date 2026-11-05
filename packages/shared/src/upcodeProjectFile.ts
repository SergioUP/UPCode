import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { UPCodeProjectFile, UPCODE_PROJECT_FILE_SCHEMA_URL } from "@upcode/contracts";

import { fromLenientJson } from "./schemaJson.ts";

/**
 * Codec between the raw `upcode.json` file contents (lenient JSONC string) and the
 * decoded {@link UPCodeProjectFile}.
 */
export const UPCodeProjectFileFromJson = fromLenientJson(UPCodeProjectFile);

const decodeT3ProjectFile = Schema.decodeExit(UPCodeProjectFileFromJson);

/**
 * Decode raw `upcode.json` contents, treating invalid or malformed files as
 * absent. Clients use this to read optional defaults (scripts, thread env
 * mode) without surfacing decode errors to the user.
 */
export function parseT3ProjectFile(contents: string): UPCodeProjectFile | null {
  const decoded = decodeT3ProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

/**
 * Build the publishable JSON Schema document for `upcode.json` (draft 2020-12).
 *
 * Served from the marketing site at {@link UPCODE_PROJECT_FILE_SCHEMA_URL} so
 * editors get LSP support via a `$schema` reference.
 */
export function buildT3ProjectFileJsonSchema(): Record<string, unknown> {
  // Closed objects, as before effect rc.113 changed the generator default;
  // editors then flag unknown keys in upcode.json.
  const document = Schema.toJsonSchemaDocument(UPCodeProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: UPCODE_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
