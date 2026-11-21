/* global window, DOMParser */
/**
 * Render the mindmap audit inventory with the pinned official PlantUML engine and record whether it
 * accepts each source and draws the expected node texts.
 *
 * The inventory comes from packages/diagram-mindmap/src/renderer-conformance.test.ts:
 *   MINDMAP_AUDIT_INVENTORY=path/inventory.json npx vitest run packages/diagram-mindmap/src/renderer-conformance.test.ts
 *   node scripts/audit-mindmap-renderer.mjs path/inventory.json tests/fixtures/official-plantuml/mindmap-renderer-observations.json
 *
 * Same headless-Chromium approach as scripts/audit-plantuml-renderer.mjs. The browser and the
 * local server it needs are closed before the script exits.
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Usage: node scripts/audit-mindmap-renderer.mjs INVENTORY.json OBSERVATIONS.json");
const inventory = JSON.parse(await readFile(input, "utf8"));
const engineRoot = dirname(fileURLToPath(import.meta.resolve("@plantuml/core")));
const version = JSON.parse(await readFile(join(engineRoot, "package.json"), "utf8")).version;
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
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(origin + "/")
      ? route.continue()
      : route.abort(),
  );
  await page.goto(origin);
  await page.waitForFunction(() => typeof window.renderToString === "function");
  const cache = new Map();
  const render = async (source) => {
    const hash = createHash("sha256").update(source).digest("hex");
    if (!cache.has(hash)) {
      cache.set(
        hash,
        await page.evaluate(
          (source) =>
            new Promise((resolve) => {
              const timer = setTimeout(() => resolve({ status: "failure", message: "Renderer timed out" }), 20000);
              const finish = (result) => {
                clearTimeout(timer);
                resolve(result);
              };
              try {
                window.renderToString(
                  source.split(/\r?\n/),
                  (svg) => {
                    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
                    if (!document.querySelector("svg") || document.querySelector("parsererror")) {
                      finish({ status: "failure", message: "Renderer returned malformed SVG" });
                      return;
                    }
                    const all = [...document.querySelectorAll("text")].map((item) => item.textContent);
                    const rejected = all.some((text) =>
                      /Syntax Error|Bad indentation|IllegalStateException|^PlantUML version|\[From /.test(text),
                    );
                    // Node texts are direct children of the top group; title, header and the like are nested.
                    const nodeTexts = [...document.querySelectorAll("svg > g > text")]
                      .map((item) => item.textContent.trim())
                      .filter(Boolean);
                    finish({ status: rejected ? "rejected" : "accepted", nodeTexts });
                  },
                  (message) => finish({ status: "failure", message: String(message) }),
                );
              } catch (error) {
                finish({ status: "failure", message: String(error) });
              }
            }),
          source,
        ),
      );
    }
    return { hash, ...cache.get(hash) };
  };
  const sameTexts = (drawn, expected, unordered) =>
    (unordered ? [...drawn].sort() : drawn).join("\u0001") ===
    (unordered ? [...expected].sort() : expected).join("\u0001");
  const results = [];
  const record = async (item) => {
    const rendered = await render(item.source);
    const textsMatch =
      item.expectedTexts && rendered.status === "accepted"
        ? sameTexts(rendered.nodeTexts, item.expectedTexts, item.unordered)
        : undefined;
    results.push({
      id: item.id,
      hash: rendered.hash,
      status: rendered.status,
      ...(textsMatch === undefined ? {} : { textsMatch }),
      // Kept only for a mismatch, so the recorded file stays small and a failure can be read.
      ...(textsMatch === false ? { expected: item.expectedTexts, drawn: rendered.nodeTexts } : {}),
      ...(rendered.status === "failure" ? { message: rendered.message } : {}),
    });
    if (results.length % 100 === 0) console.log(`Rendered ${results.length} cases (${cache.size} unique sources)`);
  };
  for (const group of [inventory.baselines, inventory.controls, inventory.cases])
    for (const item of group) await record(item);
  await writeFile(output, JSON.stringify({ engine: "@plantuml/core", version, results }, null, 2) + "\n");
  const count = (status) => results.filter((item) => item.status === status).length;
  console.log(
    `${results.length} cases, ${cache.size} unique sources, PlantUML ${version}: ${count("accepted")} accepted, ${count("rejected")} rejected, ${count("failure")} failures, ${results.filter((item) => item.textsMatch === false).length} text mismatches`,
  );
  if (count("failure") > 0) throw new Error(`Renderer failures are recorded in ${output}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
