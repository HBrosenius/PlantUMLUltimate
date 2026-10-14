// node benchmarks/project-index.mjs [output.json]
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve(process.argv[2] ?? "test-results/project-index/results.json");
await mkdir(resolve("test-results/project-index"), { recursive: true });
const modulePath = resolve("test-results/project-index/index.mjs");
await build({
  entryPoints: ["apps/web/src/projects/project-index.ts"],
  outfile: modulePath,
  bundle: true,
  platform: "node",
  format: "esm",
});
const { indexVirtualProject } = await import(pathToFileURL(modulePath));
const documents = Array.from({ length: 200 }, (_, i) => ({
  id: crypto.randomUUID(),
  path: `Diagram ${i + 1}`,
  format: "plantuml",
}));
const inputs = new Map(
  documents.map((document, i) => [
    document.path,
    {
      state: "available",
      source: `@startwbs\n*(root${i}) Programme ${i}\n${Array.from({ length: 10 }, (_, j) => `**(node${i}_${j}) Deliverable ${j}`).join("\n")}\n@endwbs`,
    },
  ]),
);
const manifest = {
  format: "plantuml-ultimate-project",
  schemaVersion: 1,
  projectId: crypto.randomUUID(),
  revisionId: crypto.randomUUID(),
  name: "Index workload",
  documents,
  elements: [],
  links: [],
};
const seed = await indexVirtualProject(JSON.stringify(manifest), inputs);
for (const member of seed.members) {
  const sourceHash = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(member.source)),
  ).toString("hex");
  for (const declaration of member.declarations)
    manifest.elements.push({
      id: crypto.randomUUID(),
      documentId: member.documentId,
      kind: declaration.kind,
      locator: {
        symbolKey: declaration.symbolKey,
        declarationHash: declaration.declarationHash,
        from: declaration.from,
        to: declaration.to,
        keyType: "semantic-key",
        sourceHash,
      },
    });
}
for (let i = 0; i < manifest.elements.length - 11; i += 2)
  manifest.links.push({
    id: crypto.randomUUID(),
    kind: "relates",
    from: manifest.elements[i].id,
    to: manifest.elements[i + 11].id,
  });
const runs = [];
for (let i = 0; i < 6; i++) {
  const start = performance.now();
  const indexed = await indexVirtualProject(JSON.stringify(manifest), inputs);
  const milliseconds = performance.now() - start;
  if (
    indexed.members.length !== 200 ||
    indexed.members.reduce((total, member) => total + member.linkCount, 0) !== manifest.links.length * 2 ||
    indexed.resolutions.size !== manifest.elements.length ||
    [...indexed.resolutions.values()].some((resolution) => resolution.state !== "resolved")
  )
    throw new Error("Index result mismatch");
  runs.push(milliseconds);
}
const result = {
  documents: documents.length,
  elements: manifest.elements.length,
  links: manifest.links.length,
  warmupMs: runs[0],
  runsMs: runs.slice(1),
  medianMs: [...runs.slice(1)].sort((a, b) => a - b)[2],
  node: process.version,
  ok: true,
};
const cache = new Map();
let previous = await indexVirtualProject(JSON.stringify(manifest), inputs, undefined, cache);
const incrementalRuns = [];
const firstPath = documents[0].path;
const originalSource = inputs.get(firstPath).source;
for (let revision = 0; revision < 5; revision++) {
  inputs.set(firstPath, { state: "available", source: originalSource + `\n' edit ${revision}` });
  const started = performance.now();
  const next = await indexVirtualProject(JSON.stringify(manifest), inputs, undefined, cache);
  incrementalRuns.push(performance.now() - started);
  if (
    next.members[1].declarations !== previous.members[1].declarations ||
    next.resolutions.get(manifest.elements[11].id) !== previous.resolutions.get(manifest.elements[11].id) ||
    [...next.resolutions.values()].some((resolution) => resolution.state !== "resolved")
  )
    throw new Error("Incremental index lost an unchanged declaration or locator resolution");
  previous = next;
}
result.incremental = {
  changedDocuments: 1,
  reusedDocuments: 199,
  runsMs: incrementalRuns,
  medianMs: [...incrementalRuns].sort((a, b) => a - b)[2],
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
