// Isolated Node microbenchmarks; not browser latency or an application speedup claim.
/* global process, performance, Buffer, console */
import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const output = process.env.PERFORMANCE_AUDIT_OUTPUT ?? "docs/audits/2026-10-13-performance-analysis";
await mkdir(output, { recursive: true });
await mkdir("test-results", { recursive: true });
const result = await build({
  stdin: {
    contents: `
export { parseGantt } from '@plantuml-studio/diagram-gantt';
export { parseSequence } from '@plantuml-studio/diagram-sequence';
export { parseClassDiagram } from '@plantuml-studio/diagram-class';
export { parseWbs } from '@plantuml-studio/diagram-wbs';
export { analyzeDiagram } from './apps/web/src/diagram-diagnostics';
export { parseSequenceSettings } from './apps/web/src/sequence-settings';
export { parseClassSettings } from './apps/web/src/class-settings';
export { parseActivitySettings } from './apps/web/src/activity-settings';
export { parseUseCaseSettings } from './apps/web/src/usecase-settings';
export { parseGanttCalendar } from './apps/web/src/gantt-calendar';
export { resolveTaskDates } from './apps/web/src/gantt-schedule';
`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const bundle = resolve("test-results/performance-analysis-functions.mjs");
await writeFile(bundle, result.outputFiles[0].text);
const api = await import(pathToFileURL(bundle));
const records = [];
function measure(fn) {
  for (let i = 0; i < 5; i++) fn();
  const samples = [];
  for (let i = 0; i < 30; i++) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: samples[15], p95Ms: samples[28] };
}
for (const kind of ["gantt", "sequence", "class", "wbs"])
  for (const count of [100, 500, 1000]) {
    const source =
      kind === "gantt"
        ? "@startgantt\nProject starts 2026-10-01\n" +
          Array.from({ length: count }, (_, i) => `[Task ${i}] starts 2026-10-01 and lasts 3 days`).join("\n") +
          "\n@endgantt"
        : kind === "sequence"
          ? "@startuml\nparticipant A\nparticipant B\n" +
            Array.from({ length: count }, (_, i) => `A -> B: Message ${i}`).join("\n") +
            "\n@enduml"
          : kind === "class"
            ? "@startuml\n" +
              Array.from({ length: count }, (_, i) => `class Entity${i} {\n+id: UUID\n+run(): void\n}`).join("\n") +
              "\n@enduml"
            : "@startwbs\n* Root\n" + Array.from({ length: count }, (_, i) => `** Node ${i}`).join("\n") + "\n@endwbs";
    const parse = {
      gantt: api.parseGantt,
      sequence: api.parseSequence,
      class: api.parseClassDiagram,
      wbs: api.parseWbs,
    }[kind];
    const parsed = kind === "gantt" ? api.parseGantt(source) : undefined;
    let revision = 0;
    const costs = {
      sameSourceParse: measure(() => parse(source)),
      freshSourceParse: measure(() => parse(source + "\n' revision " + revision++)),
      unconditionalGanttParse: measure(() => api.parseGantt(source)),
      inspectorSettings: measure(() => {
        api.parseSequenceSettings(source);
        api.parseClassSettings(source);
        api.parseActivitySettings(source);
        api.parseUseCaseSettings(source);
      }),
      diagnosticsAndQuickFixes: measure(() => {
        const a = api.analyzeDiagram(kind, source, parsed);
        return [a.diagnostics, a.quickFixes];
      }),
    };
    if (parsed) {
      const snapshots = Array.from({ length: 35 }, () => api.parseGantt(source));
      let snapshot = 0;
      costs.freshSnapshotDiagnosticsAndQuickFixes = measure(() => {
        const analysis = api.analyzeDiagram(kind, source, snapshots[snapshot++]);
        return [analysis.diagnostics, analysis.quickFixes];
      });
      costs.schedule = measure(() =>
        api.resolveTaskDates(
          parsed.document.tasks,
          parsed.document.dependencies,
          parsed.document.projectStart?.value,
          api.parseGanttCalendar(source),
        ),
      );
    }
    records.push({ kind, count, bytes: Buffer.byteLength(source), costs });
  }
await writeFile(
  `${output}/analysis-costs.json`,
  JSON.stringify(
    {
      runtime: process.version,
      method: "5 warmups, 30 observations per operation; valid synthetic source; Node, not browser",
      records,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(records, null, 2));
