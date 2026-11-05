import type { APIRoute } from "astro";

import { buildT3ProjectFileJsonSchema } from "@upcode/shared/t3ProjectFile";

// Rendered at build time; published at https://upcode.codes/schema/upcode.json so
// upcode.json files can reference it via "$schema" for editor/LSP support.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildT3ProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
