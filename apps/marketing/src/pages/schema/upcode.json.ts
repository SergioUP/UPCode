import type { APIRoute } from "astro";

import { buildUPCodeProjectFileJsonSchema } from "@upcode/shared/upcodeProjectFile";

// Rendered at build time; published at https://upcode.codes/schema/upcode.json so
// upcode.json files can reference it via "$schema" for editor/LSP support.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildUPCodeProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
