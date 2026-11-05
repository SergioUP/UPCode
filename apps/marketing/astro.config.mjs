import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://upcode.codes",
  server: {
    port: Number(process.env.PORT ?? 4173),
  },
});
