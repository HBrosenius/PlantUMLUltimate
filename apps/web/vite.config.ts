import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [react(), pwaServiceWorker()],
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
