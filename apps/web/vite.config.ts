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

// The dev server needs Vite's inline React refresh preamble and its HMR socket; the built page
// keeps the strict policy from index.html.
export function devContentSecurityPolicy(): Plugin {
  return {
    name: "plantuml-ultimate-dev-csp",
    apply: "serve",
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:* http://127.0.0.1:*");
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
      "/theme-init.js",
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

export function jiraDevelopmentOrigin(
  origin: string | undefined,
  host: string | undefined,
  method: string | undefined,
): string | undefined {
  // The deployed Worker accepts only the production app, so the dev proxy presents that origin
  // for requests that really come from this dev server.
  if ((!origin && method === "GET") || (host && (origin === `http://${host}` || origin === `https://${host}`)))
    return "https://plantuml.brosenius.se";
  return origin;
}

// Over HTTPS the Worker's session cookies carry the `__Host-` prefix, which a browser accepts only
// with Secure and Path=/. The dev proxy serves them over http under /__jira/, so it strips the
// prefix on the way to the browser and restores it on the way back.
export function jiraDevelopmentCookieToBrowser(value: string): string {
  return value
    .replace(/^__Host-/, "")
    .replace(/;\s*Secure\b/gi, "")
    .replace(/Path=\//gi, "Path=/__jira/");
}

export function jiraDevelopmentCookieToWorker(header: string): string {
  return header.replace(/(^|;\s*)(jira_session|jira_oauth_session)=/g, "$1__Host-$2=");
}

export default defineConfig({
  base: "/",
  plugins: [react(), devContentSecurityPolicy(), openIconicAsset(), isolatedRendererAssets(), pwaServiceWorker()],
  server: {
    proxy: {
      "/__jira/api/": {
        target: "https://jira.plantuml.brosenius.se",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__jira/, ""),
        configure(proxy) {
          proxy.on("proxyReq", (upstream, request) => {
            const origin = jiraDevelopmentOrigin(request.headers.origin, request.headers.host, request.method);
            if (origin) upstream.setHeader("Origin", origin);
            const cookie = request.headers.cookie;
            if (cookie) upstream.setHeader("Cookie", jiraDevelopmentCookieToWorker(cookie));
          });
          proxy.on("proxyRes", (response) => {
            const cookies = response.headers["set-cookie"];
            if (cookies) response.headers["set-cookie"] = cookies.map(jiraDevelopmentCookieToBrowser);
          });
        },
      },
    },
  },
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
