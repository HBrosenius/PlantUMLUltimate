import { build as bundleWorker } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @plantuml/core's engine lazily loads its OpenIconic sprite set (for a WBS/mindmap node's
// "<&name>" icon) by requesting "/openiconic.js" relative to the page's own origin — not
// relative to wherever the bundler placed plantuml.js — so it must be served verbatim at that
// exact root path rather than imported as a normal fingerprinted asset. Reading straight from
// the installed package (rather than committing a copy under public/) keeps it in sync with
// whatever @plantuml/core version is installed.
function openIconicAsset(): Plugin {
  const source = readFileSync(fileURLToPath(import.meta.resolve("@plantuml/core/openiconic.js")));
  return {
    name: "plantuml-ultimate-openiconic",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/openiconic.js") return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(source);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "openiconic.js", source });
    },
  };
}

function isolatedRendererAssets(): Plugin {
  return {
    name: "isolated-renderer-assets",
    configureServer(server) {
      let bundled: Promise<string> | undefined;
      server.watcher.on("change", () => {
        bundled = undefined;
      });
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path === "/__renderer_assets__/canonical.worker.js") {
          bundled ??= bundleWorker({
            entryPoints: [fileURLToPath(new URL("./src/render/canonical.worker.ts", import.meta.url))],
            bundle: true,
            write: false,
            format: "esm",
            platform: "browser",
            target: "es2022",
          }).then((r) => r.outputFiles[0]!.text);
          res.setHeader("Content-Type", "application/javascript");
          void bundled.then(
            (code) => res.end(code),
            () => {
              res.statusCode = 500;
              res.end("Renderer unavailable");
              bundled = undefined;
            },
          );
          return;
        }
        const asset =
          path === "/__renderer_assets__/plantuml.js"
            ? "@plantuml/core/plantuml.js"
            : path === "/__renderer_assets__/viz-global.js"
              ? "@plantuml/core/viz-global.js"
              : undefined;
        if (!asset) return next();
        res.setHeader("Content-Type", "application/javascript");
        res.end(readFileSync(fileURLToPath(import.meta.resolve(asset))));
      });
    },
  };
}

export function serviceWorkerSource(files: readonly string[]): string {
  const paths = [
    ...new Set([
      "/",
      "/index.html",
      "/manifest.webmanifest",
      "/favicon.svg",
      "/icon-192.png",
      "/icon-512.png",
      "/icon-maskable-512.png",
      ...files,
    ]),
  ].sort();
  const version = paths
    .join("\n")
    .split("")
    .reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261)
    .toString(16);
  return `const CACHE = "plantuml-ultimate-${version}";
const PRECACHE = ${JSON.stringify(paths)};
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))));
self.addEventListener("activate", (event) => event.waitUntil(Promise.all([caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("plantuml-ultimate-") && key !== CACHE).map((key) => caches.delete(key)))), self.clients.claim()])));
self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put("/index.html", copy)); return response; }).catch(() => caches.match("/index.html")));
    return;
  }
  event.respondWith(caches.match(url.pathname).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(url.pathname, copy)); } return response; })));
});
`;
}

function pwaServiceWorker(): Plugin {
  return {
    name: "plantuml-ultimate-pwa",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.values(bundle).map((item) => `/${item.fileName}`);
      this.emitFile({ type: "asset", fileName: "service-worker.js", source: serviceWorkerSource(files) });
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [react(), openIconicAsset(), isolatedRendererAssets(), pwaServiceWorker()],
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
