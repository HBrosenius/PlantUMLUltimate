import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

process.env.ATLASSIAN_CLIENT_SECRET ??= "test-secret";
process.env.TOKEN_ENCRYPTION_KEY ??= "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(__dirname, "migrations")),
          ATLASSIAN_CLIENT_ID: "test-client",
          // Production allows only the deployed app; tests call from the local dev origin.
          ALLOWED_ORIGINS: "https://plantuml.brosenius.se,http://localhost:5173,http://127.0.0.1:5173",
          ATLASSIAN_CLIENT_SECRET: "test-secret",
          TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        },
      },
    })),
  ],
  test: { setupFiles: ["./test/apply-migrations.ts"] },
});
