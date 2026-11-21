/* global window, DOMParser */
/**
 * Renders every source in a JSON file ({ name: { source, nodes } }, written by
 * apps/web/src/features/mindmap/mindmap-move-audit.test.ts) with the pinned @plantuml/core engine, and reports the ones
 * the engine rejects or draws with another number of labels than the document has nodes (a garbled picture comes
 * out without an error message). Documents with multi-line labels are only checked for errors.
 * Usage: node scripts/audit-mindmap-moves.mjs moves.json
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sources = JSON.parse(await readFile(process.argv[2], "utf8"));
const engineRoot = dirname(fileURLToPath(import.meta.resolve("@plantuml/core")));
const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(
      '<!doctype html><script src="/viz-global.js"></script><script type="module">import {renderToString} from "/plantuml.js"; window.renderToString = renderToString;</script>',
    );
  } else if (["/viz-global.js", "/plantuml.js", "/emoji.js", "/openiconic.js"].includes(request.url)) {
    response.setHeader("Content-Type", "text/javascript");
    response.end(await readFile(join(engineRoot, request.url.slice(1))));
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
let accepted = 0;
const bad = [];
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.renderToString === "function");
  for (const [key, { source, nodes }] of Object.entries(sources)) {
    const out = await page.evaluate(
      (source) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ error: "timeout" }), 20000);
          window.renderToString(
            source.split(/\r?\n/),
            (svg) => {
              clearTimeout(timer);
              const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
              resolve({
                texts: [...doc.querySelectorAll("svg > g > text")].map((t) => t.textContent),
                error: /Syntax Error|Bad indentation|IllegalState/.test(svg),
              });
            },
            (message) => {
              clearTimeout(timer);
              resolve({ error: String(message) });
            },
          );
        }),
      source,
    );
    const multiline = /\n[*+-]+:/.test(source);
    if (out.error || (!multiline && out.texts.length !== nodes))
      bad.push({ key, source, texts: out.texts?.length, nodes, error: out.error });
    else accepted += 1;
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`accepted ${accepted} of ${Object.keys(sources).length}`);
for (const item of bad.slice(0, 10)) console.log("BAD", JSON.stringify(item));
