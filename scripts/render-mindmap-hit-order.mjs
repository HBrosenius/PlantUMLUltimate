/* global window, DOMParser */
/**
 * Renders the sources in scripts/mindmap-hit-order-sources.mjs with the pinned @plantuml/core engine and writes
 * tests/fixtures/mindmap-svg/hit-order.json. Each node line gets a unique suffix (` n<index>`), the
 * source is rendered, and `order` lists the node indices (source order, 0-based) in the order the engine
 * draws their labels, read from the `<text>` elements that are direct children of the top group, as the
 * preview reads them. The preview's hit-target ordering is tested against this file.
 * Usage: node scripts/render-mindmap-hit-order.mjs
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sources } from "./mindmap-hit-order-sources.mjs";

const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "tests",
  "fixtures",
  "mindmap-svg",
  "hit-order.json",
);
const engineRoot = dirname(fileURLToPath(import.meta.resolve("@plantuml/core")));
const server = createServer(async (request, response) => {
  try {
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
  } catch {
    response.writeHead(500);
    response.end("Could not load renderer asset");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.renderToString === "function");
  const fixtures = {};
  for (const [name, source] of Object.entries(sources)) {
    let index = 0;
    const unique = source
      .split("\n")
      .map((line) => (/^[*+-]+ /.test(line) ? `${line} n${index++}` : line))
      .join("\n");
    const texts = await page.evaluate(
      (source) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(["<timeout>"]), 20000);
          window.renderToString(
            source.split(/\r?\n/),
            (svg) => {
              clearTimeout(timer);
              const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
              resolve([...doc.querySelectorAll("svg > g > text")].map((text) => text.textContent));
            },
            (message) => {
              clearTimeout(timer);
              resolve([`<error ${message}>`]);
            },
          );
        }),
      unique,
    );
    const order = texts.map((text) => {
      const match = /n(\d+)\s*$/.exec(text);
      if (!match) throw new Error(`${name}: unexpected text ${JSON.stringify(text)}`);
      return Number(match[1]);
    });
    if (order.length !== index) throw new Error(`${name}: drew ${order.length} of ${index} nodes`);
    fixtures[name] = { source, order };
    console.log(name, order.join(","));
  }
  await writeFile(outFile, JSON.stringify(fixtures, null, 2) + "\n", "utf8");
} finally {
  await browser.close();
  server.close();
}
