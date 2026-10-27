import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Production allows only the deployed app; tests call from the local dev origin.
      miniflare: {
        bindings: { ALLOWED_ORIGINS: "https://plantuml.brosenius.se,http://localhost:5173,http://127.0.0.1:5173" },
      },
    }),
  ],
});
