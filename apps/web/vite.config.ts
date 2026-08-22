import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: env.GITHUB_PAGES ? "/PlantUMLUltimate/" : "/",
    plugins: [react()],
    worker: { format: "es" },
  };
});
