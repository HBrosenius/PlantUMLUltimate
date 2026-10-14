/* global console */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const dir = "docs/audits/2026-10-13-performance-analysis";
const read = async (name) => JSON.parse(await readFile(`${dir}/${name}`, "utf8"));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const previews = (await read("preview-results.json")).map((r) => ({
  browser: r.browserName,
  kind: r.kind,
  startupIncludes400msSettle: r.startupMs,
  medianFrameMs: median(r.stages.flatMap((s) => s.during.frames)),
  maxFrameMs: Math.max(...r.stages.flatMap((s) => s.during.frames)),
  htmlWrites: r.stages.map((s) => s.during.htmlWrites),
  bboxReads: r.stages.map((s) => s.during.bboxCalls),
  renderResultsDuringTyping: r.stages.map((s) => s.during.renderMessages),
  medianEngineMs: median(r.stages.flatMap((s) => s.settled.engineMs)),
  errors: r.errors,
}));
const large = await read("large/results.json");
const cases = large.cases.map((c) => ({
  browser: c.browser,
  name: c.name,
  ok: c.ok,
  failure: c.failure,
  initial: c.initial,
  edits: c.timings,
  fileOpen: c.fileOpen,
  typing: c.rapidTyping && {
    medianFrameMs: median(c.rapidTyping.samples.map((s) => s.nextFrameMs)),
    maxFrameMs: Math.max(...c.rapidTyping.samples.map((s) => s.nextFrameMs)),
    editorReadyMs: c.rapidTyping.editorReadyMs,
    previewReadyMs: c.rapidTyping.previewReadyMs,
    undoCount: c.rapidTyping.undoCount,
  },
  persistence: c.persistence,
}));
const files = [];
for (const name of await readdir("apps/web/dist/assets")) {
  const bytes = await readFile(`apps/web/dist/assets/${name}`);
  files.push({ name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length });
}
const p = await read("diagnostics.cpuprofile");
const frames = new Map(p.nodes.map((n) => [n.id, n.callFrame.functionName]));
const counts = new Map();
for (const id of p.samples) {
  const key = frames.get(id);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const profile = [...counts]
  .map(([name, samples]) => ({ name, samples, percent: (samples / p.samples.length) * 100 }))
  .sort((a, b) => b.samples - a.samples)
  .slice(0, 15);
const summary = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  machine: large.machine,
  previews,
  cases,
  files,
  diagnosticsProfile: { samples: p.samples.length, topSelfTimeSamples: profile },
};
await writeFile(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify(
    {
      cases: cases.map((c) => ({
        browser: c.browser,
        name: c.name,
        ok: c.ok,
        initial: c.initial.wallMs,
        editMs: c.edits[0]?.wallMs,
        typing: c.typing,
      })),
      profile,
      files,
    },
    null,
    2,
  ),
);
