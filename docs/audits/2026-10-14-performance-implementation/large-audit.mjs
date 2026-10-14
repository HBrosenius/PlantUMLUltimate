// Production build required. Runs the original large-workload harness with an owned preview server.
/* global process, fetch, setTimeout */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const origin = "http://127.0.0.1:4175";
const server = spawn(
  process.execPath,
  [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "4175", "--strictPort"],
  { cwd: resolve("apps/web"), stdio: "ignore" },
);
process.env.LARGE_DOCUMENT_ORIGIN = origin;
process.env.LARGE_DOCUMENT_RUNS ??= "1";
process.env.LARGE_DOCUMENT_FILTER ??= "^(gantt-200|document-200)$";
process.env.LARGE_DOCUMENT_TYPING = "1";
process.env.LARGE_DOCUMENT_OUTPUT ??= "docs/audits/2026-10-14-performance-implementation/large";
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup is asynchronous. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  if (!ready) throw new Error("Production preview did not start");
  await import("../../../benchmarks/large-documents.mjs");
} finally {
  server.kill();
}
