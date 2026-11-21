/* global window, DOMParser */
/**
 * Render the mindmap spike sources with the pinned @plantuml/core engine and write
 * tests/fixtures/mindmap-svg/<name>.{puml,svg} plus structure.json.
 * Uses the same headless-Chromium approach as scripts/audit-plantuml-renderer.mjs.
 * Usage: node scripts/render-mindmap-fixtures.mjs
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sources } from "./mindmap-fixture-sources.mjs";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "mindmap-svg");
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
  await mkdir(outDir, { recursive: true });
  const structure = { engine: "@plantuml/core", version, fixtures: {} };
  for (const [name, source] of Object.entries(sources)) {
    const result = await page.evaluate(
      (source) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ status: "timeout" }), 20000);
          const finish = (value) => {
            clearTimeout(timer);
            resolve(value);
          };
          try {
            window.renderToString(
              source.split(/\r?\n/),
              (svg) => {
                const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
                const num = (value) => (value === null ? undefined : Math.round(Number(value) * 100) / 100);
                const texts = [...doc.querySelectorAll("text")].map((text, order) => {
                  const chain = [];
                  for (let node = text.parentElement; node && node.localName !== "svg"; node = node.parentElement)
                    chain.push(
                      `${node.localName}${node.id ? "#" + node.id : ""}${node.getAttribute("class") ? "." + node.getAttribute("class") : ""}`,
                    );
                  return {
                    order,
                    text: text.textContent,
                    x: num(text.getAttribute("x")),
                    y: num(text.getAttribute("y")),
                    textLength: num(text.getAttribute("textLength")),
                    parents: chain,
                  };
                });
                const groups = [...doc.querySelectorAll("g")].map((group) => ({
                  id: group.id || undefined,
                  class: group.getAttribute("class") || undefined,
                  data: Object.fromEntries(
                    [...group.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value]),
                  ),
                  texts: group.querySelectorAll(":scope > text").length,
                }));
                const dataAttributes = new Set();
                for (const element of doc.querySelectorAll("*"))
                  for (const attribute of element.attributes)
                    if (attribute.name.startsWith("data-"))
                      dataAttributes.add(`${element.localName}[${attribute.name}]`);
                const elements = {};
                for (const element of doc.querySelectorAll("svg *"))
                  elements[element.localName] = (elements[element.localName] ?? 0) + 1;
                const failed = texts.some((t) =>
                  /Syntax Error|Bad indentation|IllegalStateException|^PlantUML version/.test(t.text),
                );
                finish({
                  status: failed ? "engine-error" : "ok",
                  svg,
                  texts,
                  groups,
                  dataAttributes: [...dataAttributes].sort(),
                  elements,
                });
              },
              (message) => finish({ status: "error", message: String(message) }),
            );
          } catch (error) {
            finish({ status: "error", message: String(error) });
          }
        }),
      source,
    );
    await writeFile(
      join(outDir, `${name}.puml`),
      source.replace(/\r\n/g, "\n") + (name === "30-crlf" ? "" : "\n"),
      "utf8",
    );
    if (result.svg) await writeFile(join(outDir, `${name}.svg`), result.svg, "utf8");
    const summary = { ...result };
    delete summary.svg;
    structure.fixtures[name] = summary;
    console.log(
      name,
      result.status,
      result.texts ? result.texts.map((t) => t.text).join(" | ") : (result.message ?? ""),
    );
  }
  await writeFile(join(outDir, "structure.json"), JSON.stringify(structure, null, 2) + "\n", "utf8");
} finally {
  await browser?.close();
  server.close();
}
