import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    // PlantUML and Graphviz are intentionally emitted as large standalone assets and
    // loaded by the renderer iframe only when preview rendering is enabled.
    chunkSizeWarningLimit: 7_500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules") && !id.includes("/packages/")) return undefined;
          if (/node_modules\/(?:react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (/node_modules\/(?:@codemirror|codemirror|@lezer)\//.test(id)) return "editor-vendor";
          if (id.includes("/packages/diagram-") || id.includes("/packages/language-")) return "diagram-engines";
          return undefined;
        },
      },
    },
  },
});
