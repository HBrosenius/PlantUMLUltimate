// Run analysis-costs.mjs first to generate the bundled functions.
/* global console, process */
import { Session } from "node:inspector";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(resolve("test-results/performance-analysis-functions.mjs")));
const output = process.env.PERFORMANCE_AUDIT_OUTPUT ?? "docs/audits/2026-10-13-performance-analysis";
await mkdir(output, { recursive: true });
const source =
  "@startgantt\nProject starts 2026-10-01\n" +
  Array.from({ length: 1000 }, (_, i) => `[Task ${i}] starts 2026-10-01 and lasts 3 days`).join("\n") +
  "\n@endgantt";
const parsed = api.parseGantt(source);
const snapshots = process.env.PROFILE_FRESH_SNAPSHOTS
  ? Array.from({ length: 40 }, () => api.parseGantt(source))
  : undefined;
const session = new Session();
session.connect();
const post = promisify(session.post).bind(session);
await post("Profiler.enable");
await post("Profiler.start");
for (let i = 0; i < 40; i++) {
  const a = api.analyzeDiagram("gantt", source, snapshots?.[i] ?? parsed);
  void a.diagnostics;
  void a.quickFixes;
}
const { profile } = await post("Profiler.stop");
session.disconnect();
const counts = new Map();
for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
const summary = profile.nodes
  .map((n) => ({ ...n.callFrame, samples: counts.get(n.id) ?? 0 }))
  .filter((n) => n.samples)
  .sort((a, b) => b.samples - a.samples)
  .slice(0, 35);
await writeFile(`${output}/diagnostics.cpuprofile`, JSON.stringify(profile));
await writeFile(
  `${output}/diagnostics-profile.json`,
  JSON.stringify(
    { freshSnapshots: Boolean(snapshots), totalSamples: profile.samples.length, hottest: summary },
    null,
    2,
  ),
);
console.log(JSON.stringify(summary.slice(0, 15), null, 2));
