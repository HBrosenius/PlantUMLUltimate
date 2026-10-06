/* global window, DOMParser, NodeFilter, XMLSerializer */
/** Render an exported mutation inventory with the pinned official PlantUML engine. */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const [input, output, observations] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Usage: node scripts/audit-plantuml-renderer.mjs INPUT.json OUTPUT.json [OBSERVATIONS.json]");
const cases = JSON.parse(await readFile(input, "utf8"));
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
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
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
    if (cache.has(hash)) return { hash, ...cache.get(hash) };
    const result = await page.evaluate(
      (source) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ status: "failure", message: "Renderer timed out" }), 15000);
          const finish = (result) => {
            clearTimeout(timer);
            resolve(result);
          };
          try {
            window.renderToString(
              source.split(/\r?\n/),
              (svg) => {
                const document = new DOMParser().parseFromString(svg, "image/svg+xml");
                const texts = [...document.querySelectorAll("text")].map((item) => item.textContent);
                if (
                  texts.some((text) => /\[From .+\(line \d+\)/.test(text)) &&
                  texts.some((text) => /syntax error/i.test(text))
                )
                  finish({ status: "rejected", message: texts.join("\n") });
                else if (!document.querySelector("svg") || document.querySelector("parsererror"))
                  finish({ status: "failure", message: "Renderer returned malformed SVG" });
                else {
                  // Compare the complete drawing, including arrows and grouping, while
                  // removing source metadata and normalizing generated IDs/references.
                  document.querySelectorAll("metadata, desc").forEach((item) => item.remove());
                  const ids = new Map(
                    [...document.querySelectorAll("[id]")].map((item, index) => [item.id, `id${index}`]),
                  );
                  for (const element of document.querySelectorAll("*")) {
                    for (const attribute of [...element.attributes]) {
                      if (/^data-(?:source|line)/.test(attribute.name)) element.removeAttribute(attribute.name);
                      else if (attribute.name === "id") element.setAttribute("id", ids.get(attribute.value));
                      else if (/^(?:href|xlink:href)$/.test(attribute.name) && attribute.value.startsWith("#"))
                        element.setAttribute(
                          attribute.name,
                          "#" + (ids.get(attribute.value.slice(1)) ?? attribute.value.slice(1)),
                        );
                      else if (attribute.value.includes("url(#"))
                        element.setAttribute(
                          attribute.name,
                          attribute.value.replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${ids.get(id) ?? id})`),
                        );
                    }
                  }
                  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
                  const comments = [];
                  while (walker.nextNode()) comments.push(walker.currentNode);
                  comments.forEach((item) => item.remove());
                  finish({
                    status: "accepted",
                    visual: new XMLSerializer().serializeToString(document),
                    labels: texts,
                    entities: [...document.querySelectorAll("[data-entity]")].map((item) =>
                      item.getAttribute("data-entity"),
                    ),
                    links: [...document.querySelectorAll("[data-entity-1][data-entity-2]")].map((item) => [
                      item.getAttribute("data-entity-1"),
                      item.getAttribute("data-entity-2"),
                    ]),
                  });
                }
              },
              (message) =>
                finish({
                  status: /syntax|error line/i.test(String(message)) ? "rejected" : "failure",
                  message: String(message),
                }),
            );
          } catch (error) {
            finish({ status: "failure", message: String(error) });
          }
        }),
      source,
    );
    if (result.visual) {
      result.visualHash = createHash("sha256").update(result.visual).digest("hex");
      delete result.visual;
    }
    cache.set(hash, result);
    return { hash, ...result };
  };
  const controlSource = "@startuml\nclass A\nclass B\nA --> B\n@enduml";
  const control = await render(controlSource);
  const whitespace = await render(controlSource.replace("class A", "  class A"));
  const reversed = await render(controlSource.replace("A --> B", "A <-- B"));
  const note = await render("@startuml\nclass A\nnote right of A : Syntax Error?\n@enduml");
  const invalid = await render("@startuml\ninvalid_declaration A\n@enduml");
  if (
    control.status !== "accepted" ||
    whitespace.visualHash !== control.visualHash ||
    reversed.visualHash === control.visualHash ||
    reversed.status !== "accepted" ||
    note.status !== "accepted" ||
    invalid.status !== "rejected"
  ) {
    throw new Error("Renderer acceptance/equivalence controls failed; do not trust this audit");
  }
  const results = [];
  for (const item of cases) {
    const baseline = await render(item.original);
    const mutated = await render(item.source);
    const repairs = [];
    for (const repair of item.repairs) {
      const rendered = await render(repair.source);
      const semantics = (result) => result.visualHash;
      repairs.push({
        ...repair,
        source: undefined,
        rendered,
        equivalent:
          rendered.status === "accepted" &&
          baseline.status === "accepted" &&
          semantics(rendered) === semantics(baseline),
        exactRestoration: repair.source === item.original,
      });
    }
    results.push({
      id: item.id,
      kind: item.kind,
      example: item.example,
      mutation: item.mutation,
      baseline,
      mutated,
      diagnostics: item.diagnostics,
      repairs,
    });
    if (results.length % 25 === 0) console.log(`Audited ${results.length}/${cases.length} cases`);
  }
  await writeFile(output, JSON.stringify({ engine: "@plantuml/core", version, results }, null, 2) + "\n");
  if (
    results.some(
      (result) =>
        result.baseline.status === "failure" ||
        result.mutated.status === "failure" ||
        result.repairs.some((repair) => repair.rendered.status === "failure"),
    )
  ) {
    throw new Error(`Renderer runtime failures recorded in ${output}; observations were not updated`);
  }
  if (observations) {
    const compact = results.map((result) => ({
      id: result.id,
      originalHash: result.baseline.hash,
      sourceHash: result.mutated.hash,
      baselineStatus: result.baseline.status,
      rendererStatus: result.mutated.status,
      diagnostics: result.diagnostics,
      repairs: result.repairs.map((repair) => ({
        mode: repair.mode,
        message: repair.message,
        sourceHash: repair.rendered.hash,
        rendererStatus: repair.rendered.status,
        equivalent: repair.equivalent,
        exactRestoration: repair.exactRestoration,
      })),
    }));
    await writeFile(
      observations,
      JSON.stringify({ engine: "@plantuml/core", version, results: compact }, null, 2) + "\n",
    );
  }
  const rejected = results.filter((result) => result.mutated.status === "rejected");
  const detected = rejected.filter((result) =>
    result.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
  );
  const repairs = results.flatMap((result) => result.repairs);
  console.log(
    `${rejected.length} mutations rejected; local validation detected ${detected.length}, missed ${rejected.length - detected.length}`,
  );
  for (const mode of ["individual", "batch"]) {
    const candidates = repairs.filter((repair) => repair.mode === mode);
    console.log(
      `${mode}: ${candidates.length} candidates, ${candidates.filter((repair) => repair.equivalent).length} equivalent drawings, ${candidates.filter((repair) => repair.rendered.status === "accepted" && !repair.equivalent).length} changed drawings, ${candidates.filter((repair) => repair.rendered.status === "rejected").length} still rejected`,
    );
  }
  console.log(`Saved ${results.length} cases to ${output} (${cache.size} unique renders, PlantUML ${version})`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
