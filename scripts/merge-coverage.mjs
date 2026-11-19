// Merges unit/component coverage (coverage/unit) with browser-test coverage (coverage/e2e) into
// coverage/combined and prints a summary of all three. Both inputs are Istanbul JSON, so a file
// covered by both counts a statement as covered if either run executed it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import libSourceMaps from "istanbul-lib-source-maps";
import reports from "istanbul-reports";

const root = "coverage";

function load(...files) {
  const map = libCoverage.createCoverageMap({});
  for (const file of files) map.merge(JSON.parse(readFileSync(file, "utf8")));
  return map;
}

const unitFile = join(root, "unit", "coverage-final.json");
const e2eDirectory = join(root, "e2e");
const e2eFiles = existsSync(e2eDirectory)
  ? readdirSync(e2eDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(e2eDirectory, name))
  : [];

// Browser coverage is instrumented on Vite's transformed output, so it still carries an input
// source map; remap it to the original TypeScript before comparing or merging with unit coverage.
// The browser shards run in a container, so their absolute paths differ from the checkout that
// collects unit coverage. Re-root every file under this checkout using its path from `apps/` or
// `packages/`, and round-trip through JSON: the remapper's Infinity end columns become null, which
// is how the unit JSON stores them, and without that the two sides never line up on a statement.
const checkout = process.cwd();
const rooted = (file) => {
  const match = file.match(/(?:^|\/)((?:apps\/web|packages\/[^/]+)\/src\/.+)$/);
  return match ? join(checkout, match[1]) : file;
};
const normalize = (map) => {
  const data = JSON.parse(JSON.stringify(map.toJSON()));
  return libCoverage.createCoverageMap(
    Object.fromEntries(Object.values(data).map((file) => [rooted(file.path), { ...file, path: rooted(file.path) }])),
  );
};
const remap = async (map) => normalize(await libSourceMaps.createSourceMapStore().transformCoverage(map));
// Merging mutates the maps it is given, so every map is built from its own copy of the files.
const loadUnit = () => (existsSync(unitFile) ? normalize(load(unitFile)) : libCoverage.createCoverageMap({}));
const loadBrowser = () => remap(load(...e2eFiles));
const unit = loadUnit();
const browser = await loadBrowser();
const combined = loadUnit();
combined.merge(await loadBrowser());

const percent = (part) => (part.total ? `${part.pct.toFixed(2)}%` : "n/a");
const rows = [
  ["Unit and component", unit],
  ["Browser (Chromium)", browser],
  ["Combined", combined],
].map(([label, map]) => {
  const s = map.getCoverageSummary();
  return {
    label,
    files: map.files().length,
    ...Object.fromEntries(["statements", "branches", "functions", "lines"].map((k) => [k, percent(s[k])])),
  };
});

const table = [
  "| Source | Files | Statements | Branches | Functions | Lines |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map((r) => `| ${r.label} | ${r.files} | ${r.statements} | ${r.branches} | ${r.functions} | ${r.lines} |`),
].join("\n");

const output = join(root, "combined");
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "coverage-final.json"), JSON.stringify(combined.toJSON()));
const context = libReport.createContext({ dir: output, coverageMap: combined });
for (const name of ["html", "json-summary", "text-summary"]) reports.create(name).execute(context);
writeFileSync(join(output, "summary.md"), `${table}\n`);
console.log(table);
if (!e2eFiles.length) console.log("\nNo browser coverage found in coverage/e2e; showing unit coverage only.");
