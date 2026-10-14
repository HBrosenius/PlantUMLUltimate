/* global console */
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const directory = "docs/audits/2026-10-14-performance-implementation";
const baseline = "docs/audits/2026-10-13-performance-analysis";
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const preview = (records) =>
  records.map((record) => ({
    browser: record.browserName,
    kind: record.kind,
    htmlWritesDuringTyping: record.stages.map((stage) => stage.during.htmlWrites),
    bboxReadsDuringTyping: record.stages.map((stage) => stage.during.bboxCalls),
    medianNextFrameMs: median(record.stages.flatMap((stage) => stage.during.frames)),
    errors: record.errors,
  }));
const responsiveness = async (path) => {
  const raw = await readFile(path, "utf8");
  const start = raw.search(/\{\s*"workspaceBytes"/);
  if (start < 0) throw new Error(`Missing workspace summary in ${path}`);
  return JSON.parse(raw.slice(start));
};
const large = (records) =>
  records.cases.map((record) => ({
    browser: record.browser,
    name: record.name,
    initialMs: record.initial.wallMs,
    editMs: record.timings[0]?.wallMs,
    engineMs: record.timings[0]?.engineMs,
    initialPreviewPhases: record.initial.previewPhases,
    editPreviewPhases: record.timings[0]?.previewPhases,
    medianTypingNextFrameMs: record.rapidTyping
      ? median(record.rapidTyping.samples.map((sample) => sample.nextFrameMs))
      : undefined,
    maxTypingNextFrameMs: record.rapidTyping
      ? Math.max(...record.rapidTyping.samples.map((sample) => sample.nextFrameMs))
      : undefined,
    undoCount: record.rapidTyping?.undoCount,
    persistence: record.persistence,
    errors: record.errors,
    ok: record.ok,
  }));
const html = await readFile("apps/web/dist/index.html", "utf8");
const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+\.js)"/g)].map((match) => match[1]))];
const initialAssets = await Promise.all(
  paths.map(async (path) => {
    const bytes = await readFile(`apps/web/dist${path}`);
    return { path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }),
);
const summary = {
  baselineRevision: "861a050",
  implementation: "local working tree; 2026-10-14",
  method:
    "Benchmarks ran sequentially on the baseline desktop; large cases are single observations, not repeated medians. Next-frame timings are scheduling observations, not field INP. Gzip is locally calculated, not deployed transfer size.",
  gantt: {
    baseline: (await json(`${baseline}/analysis-costs.json`)).records.filter((record) => record.kind === "gantt"),
    implementation: (await json(`${directory}/analysis-costs.json`)).records.filter(
      (record) => record.kind === "gantt",
    ),
    freshContextMethod:
      "35 preconstructed models: 5 warmups and 30 observations. Parsing is excluded, matching the diagnostic cost's parsed-model input; repeated-snapshot and fresh-context costs are reported separately.",
  },
  previews: {
    baseline: preview(await json(`${baseline}/preview-results.json`)),
    implementation: preview(await json(`${directory}/preview-results.json`)),
  },
  responsiveness: {
    baseline: await responsiveness(`${baseline}/responsiveness.txt`),
    implementation: await responsiveness(`${directory}/responsiveness.txt`),
  },
  large: {
    baseline: large(await json(`${baseline}/large/results.json`)),
    implementation: large(await json(`${directory}/large/results.json`)),
    finalImplementation: large(await json(`${directory}/large-final/results.json`)),
    repeatedProjectContext: large(await json(`${directory}/project-repeat/results.json`)),
  },
  index: await json(`${directory}/project-index.json`),
  initialAssets,
  initialJavaScriptBytes: initialAssets.reduce((total, asset) => total + asset.bytes, 0),
  initialJavaScriptGzipBytes: initialAssets.reduce((total, asset) => total + asset.gzipBytes, 0),
};
await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      responsiveness: summary.responsiveness.implementation.summary,
      large: summary.large.implementation,
      initialJavaScriptGzipBytes: summary.initialJavaScriptGzipBytes,
    },
    null,
    2,
  ),
);
