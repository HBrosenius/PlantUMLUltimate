// Production-browser workload audit. Start Vite preview separately, then run:
// node benchmarks/large-documents.mjs chromium [firefox webkit]
// LARGE_DOCUMENT_RUNS controls repetitions (default 5); LARGE_DOCUMENT_FILTER is a case-name regex.
/* global window, document, requestAnimationFrame */
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import os from "node:os";

const origin = process.env.LARGE_DOCUMENT_ORIGIN ?? "http://127.0.0.1:4175";
const output = resolve(process.env.LARGE_DOCUMENT_OUTPUT ?? "test-results/large-documents");
const runs = Number(process.env.LARGE_DOCUMENT_RUNS ?? 5);
await mkdir(output, { recursive: true });
const codecPath = resolve("test-results/large-document-codec.mjs");
await mkdir(resolve("test-results"), { recursive: true });
await build({
  entryPoints: ["packages/document-format/src/index.ts"],
  outfile: codecPath,
  bundle: true,
  platform: "node",
  format: "esm",
});
const codec = await import(pathToFileURL(codecPath).href);
const indexPath = resolve("test-results/large-document-index.mjs");
await build({
  entryPoints: ["apps/web/src/projects/project-index.ts"],
  outfile: indexPath,
  bundle: true,
  platform: "node",
  format: "esm",
});
const { indexVirtualProject } = await import(pathToFileURL(indexPath).href);

function gantt(count) {
  const lines = [
    "@startgantt",
    "title Release programme",
    "Project starts 2026-10-01",
    "saturday are closed",
    "sunday are closed",
  ];
  for (let i = 0; i < count; i++) {
    if (i % 25 === 0) lines.push(`-- Workstream ${i / 25 + 1} --`);
    const date = new Date(Date.UTC(2026, 9, 1 + (Math.floor(i / 10) % 5) * 7)).toISOString().slice(0, 10);
    const start = i % 10 === 0 ? date : `at [T${i - 1}]'s end`;
    lines.push(
      `[Delivery task ${i + 1}] as [T${i}] on {Team${i % 12}:50%} starts ${start} and lasts ${(i % 5) + 2} days`,
    );
    lines.push(`[T${i}] is ${(i % 5) * 20}% completed`);
  }
  lines.push("@endgantt");
  return lines.join("\n");
}
function sequence(participants, messages) {
  return [
    "@startuml",
    "title Order fulfilment",
    ...Array.from({ length: participants }, (_, i) => `participant "Service ${i + 1}" as S${i}`),
    ...Array.from(
      { length: messages },
      (_, i) => `S${i % participants} -> S${(i + 1) % participants}: Process order step ${i + 1}`,
    ),
    "@enduml",
  ].join("\n");
}
function classes(count) {
  return [
    "@startuml",
    "title Domain model",
    "left to right direction",
    ...Array.from(
      { length: count },
      (_, i) => `class Entity${i + 1} {\n  +id: UUID\n  +status: String\n  +validate(): Boolean\n}`,
    ),
    ...Array.from({ length: count - 1 }, (_, i) => `Entity${i + 1} --> Entity${i + 2} : uses`),
    ...Array.from({ length: Math.floor(count / 3) }, (_, i) => `Entity${i + 1} ..> Entity${count - i} : observes`),
    "@enduml",
  ].join("\n");
}
function wbs(count) {
  return [
    "@startwbs",
    "title Programme breakdown",
    "* Release programme",
    ...Array.from({ length: count }, (_, i) => `${i % 10 === 0 ? "**" : "***"} Deliverable ${i + 1}`),
    "@endwbs",
  ].join("\n");
}
const cases = [
  {
    name: "existing-project",
    kind: "gantt",
    source: await readFile("tests/fixtures/weekend-aware-large.puml", "utf8"),
    search: "Unified Messaging Search Back End",
  },
  ...[50, 200, 500].map((count) => ({
    name: `gantt-${count}`,
    kind: "gantt",
    source: gantt(count),
    search: `Delivery task ${count}`,
  })),
  { name: "sequence-30-300", kind: "sequence", source: sequence(30, 300), search: "Service 30" },
  { name: "sequence-12-100", kind: "sequence", source: sequence(12, 100), search: "Service 12" },
  { name: "class-100", kind: "class", source: classes(100), search: "Entity100" },
  { name: "class-15", kind: "class", source: classes(15), search: "Entity15" },
  { name: "wbs-300", kind: "wbs", source: wbs(300), search: "Deliverable 300" },
  { name: "wbs-150", kind: "wbs", source: wbs(150), search: "Deliverable 150" },
];
const kinds = ["gantt", "sequence", "class", "wbs"];
for (const count of [50, 200]) {
  const project = await codec.projectFromPlantUml(gantt(30), "gantt", `Portfolio ${count}`);
  project.diagrams[0].name = "Schedule 1";
  for (let i = 1; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const source =
      kind === "gantt" ? gantt(20) : kind === "sequence" ? sequence(8, 30) : kind === "class" ? classes(12) : wbs(25);
    const member = (await codec.projectFromPlantUml(source, kind, `Diagram ${i + 1}`)).diagrams[0];
    project.diagrams.push(member);
  }
  // Use explicit history on every member, not just its current source.
  for (const { document } of project.diagrams) {
    const sources = Array.from({ length: 5 }, (_, i) => `' retained revision ${i}\n${document.current.source}`);
    const history = await codec.encodeContentHistory(sources);
    document.contents = history.contents;
    document.versions = history.contentIds.map((contentId, i) => ({
      id: crypto.randomUUID(),
      contentId,
      createdAt: `2026-10-11T10:00:0${i}.000Z`,
      sequence: i,
      reason: "saved",
      pinned: false,
      diagramKind: document.current.diagramKind,
    }));
  }
  const manifest = {
    format: "plantuml-ultimate-project",
    schemaVersion: 1,
    projectId: project.projectId,
    revisionId: project.revisionId,
    name: project.name,
    documents: project.diagrams.map((d) => ({ id: d.id, path: d.name, format: "pumlu" })),
    elements: [],
    links: [],
  };
  const indexed = await indexVirtualProject(
    JSON.stringify(manifest),
    new Map(project.diagrams.map((d) => [d.name, { state: "available", source: d.document.current.source }])),
  );
  for (const member of indexed.members) {
    const declaration = member.declarations[0];
    if (!declaration) throw new Error(`No declaration in ${member.path}`);
    project.elements.push({
      id: crypto.randomUUID(),
      documentId: member.documentId,
      kind: declaration.kind,
      locator: {
        symbolKey: declaration.symbolKey,
        keyType: "semantic-key",
        declarationHash: declaration.declarationHash,
        sourceHash: await codec.hashSource(member.source),
        from: declaration.from,
        to: declaration.to,
      },
    });
  }
  for (let i = 0; i + 2 < project.elements.length; i += 4) {
    const [task, participant, entity] = project.elements.slice(i, i + 3);
    project.links.push(
      { id: crypto.randomUUID(), kind: "represents", from: participant.id, to: entity.id },
      { id: crypto.randomUUID(), kind: "implements", from: task.id, to: participant.id },
    );
  }
  const encoded = await codec.encodeProject(project);
  cases.push({ name: `document-${count}`, kind: "project", project, bytes: encoded.bytes, search: "Delivery task 30" });
}
const selected = cases.filter(
  (item) => !process.env.LARGE_DOCUMENT_FILTER || new RegExp(process.env.LARGE_DOCUMENT_FILTER).test(item.name),
);
await mkdir(resolve(output, "fixtures"), { recursive: true });
for (const item of selected)
  await writeFile(
    resolve(output, "fixtures", `${item.name}.${item.bytes ? "pumlu" : "puml"}`),
    item.bytes ?? item.source,
  );

async function instruments(page) {
  await page.addInitScript(() => {
    window.audit = { renders: [], longTasks: [], gaps: [], errors: [] };
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      window.audit.gaps.push({ at: now, ms: Math.max(0, now - last - 50) });
      last = now;
    }, 50);
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.audit.longTasks.push({ at: e.startTime, ms: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* Unsupported in some engines. */
    }
    window.addEventListener("message", (event) => {
      const frame = document.querySelector('iframe[title="Local PlantUML renderer"]');
      if (event.source === frame?.contentWindow && event.data?.type === "result")
        window.audit.renders.push({
          at: performance.now(),
          engineMs: event.data.durationMs,
          svg: event.data.svg,
          error: event.data.error,
        });
    });
    // In-memory File System Access adapter: exercises the real app's save/open and codec paths.
    window.auditFile = { input: [], saved: [], writes: 0, name: "audit.pumlu" };
    const handle = {
      kind: "file",
      get name() {
        return window.auditFile.name;
      },
      getFile: async () => new File([new Uint8Array(window.auditFile.input)], window.auditFile.name),
      createWritable: async () => ({
        write: async (data) => {
          window.auditFile.saved = Array.from(
            data instanceof Blob
              ? new Uint8Array(await data.arrayBuffer())
              : typeof data === "string"
                ? new TextEncoder().encode(data)
                : data,
          );
          window.auditFile.writes++;
        },
        close: async () => {},
      }),
    };
    window.showOpenFilePicker = async () => [handle];
    window.showSaveFilePicker = async () => handle;
  });
}
async function settle(page, after, text) {
  await page.waitForFunction(
    ({ after, text }) => window.audit.renders.slice(after).some((r) => r.svg?.includes(text) || r.error),
    { after, text },
    { timeout: 65_000 },
  );
  const result = await page.evaluate(() => {
    const r = window.audit.renders.at(-1);
    return { engineMs: r?.engineMs, error: r?.error };
  });
  if (result.error) throw new Error(`Renderer: ${result.error}`);
  await expect(page.locator(".statusbar")).toContainText("Preview current", { timeout: 15_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return result;
}
async function prepare(page) {
  await page.goto(origin);
  const welcome = page.getByRole("dialog", { name: "Welcome to PlantUML Ultimate" });
  const chooser = page.getByRole("dialog", { name: "Choose a diagram type" });
  await Promise.race([welcome.waitFor(), chooser.waitFor()]);
  if (await welcome.isVisible()) {
    await welcome.getByRole("radio", { name: "Diagram + code" }).check();
    await welcome.getByRole("button", { name: "Get started" }).click();
  }
  await page
    .getByRole("dialog", { name: "Choose a diagram type" })
    .getByRole("button", { name: "Gantt diagram", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("Preview current", { timeout: 65_000 });
  const close = page.getByRole("button", { name: "Close project inspector", exact: true });
  if (await close.isVisible()) await close.click();
  const hint = page.getByRole("button", { name: "Dismiss editing hint", exact: true });
  if (await hint.isVisible()) await hint.click();
}
async function replace(page, source) {
  const editor = page.locator(".cm-content");
  await editor.focus();
  await editor.press("ControlOrMeta+a");
  await page.keyboard.insertText(source);
}
async function openFile(page, bytes, name) {
  const version = codec.decodeEnvelope(bytes).version;
  const first = version === 2 ? (await codec.decodeProject(bytes)).project.diagrams[0] : undefined;
  const started = performance.now();
  await page.evaluate(
    ({ bytes, name }) => {
      window.auditFile.input = bytes;
      window.auditFile.name = name;
    },
    { bytes: Array.from(bytes), name },
  );
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page
    .getByRole("menu", { name: "Open", exact: true })
    .getByRole("menuitem", { name: version === 2 ? "Document…" : "Diagram…", exact: true })
    .click();
  if (version === 2) {
    const member = page
      .getByRole("complementary", { name: "Document navigator", exact: true })
      .getByRole("button", { name: `Inspect diagram ${first.name}`, exact: true });
    await expect(member).toBeVisible({ timeout: 65_000 });
    const navigatorReadyMs = performance.now() - started;
    await member.click();
    const memberClickMs = performance.now() - started - navigatorReadyMs;
    await expect(page.locator(".cm-content")).toContainText("Delivery task 1", { timeout: 65_000 });
    return { navigatorReadyMs, memberClickMs, memberReadyMs: performance.now() - started };
  }
}
async function sample(page, start) {
  return page.evaluate((start) => {
    const svg = document.querySelector(".diagram svg");
    const tasks = window.audit.longTasks.filter((x) => x.at >= start);
    return {
      mainThreadLongTasks: tasks.length,
      mainThreadBlockedMs: tasks.reduce((s, x) => s + x.ms, 0),
      longestMainThreadTaskMs: Math.max(0, ...tasks.map((x) => x.ms)),
      maxTimerDelayMs: Math.max(0, ...window.audit.gaps.filter((x) => x.at >= start).map((x) => x.ms)),
      domNodes: document.querySelectorAll("*").length,
      svgNodes: svg?.querySelectorAll("*").length,
      svgWidth: svg?.getAttribute("width"),
      svgHeight: svg?.getAttribute("height"),
      jsHeapBytes: performance.memory?.usedJSHeapSize,
      status: document.querySelector(".statusbar")?.textContent,
    };
  }, start);
}
async function outline(page, search) {
  const at = performance.now();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Diagram outline", exact: true });
  await dialog.waitFor();
  const openMs = performance.now() - at;
  const entriesBefore = await dialog.getByRole("button").count();
  const began = performance.now();
  await dialog.getByLabel("Search diagram elements").fill(search);
  await expect(
    dialog.getByRole("button", { name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first(),
  ).toBeVisible();
  const searchMs = performance.now() - began;
  await page.screenshot({ path: resolve(output, `${activeBrowser}-${activeCase}-outline.png`) });
  await dialog.getByRole("button", { name: "Close diagram outline", exact: true }).click();
  return { openMs, searchMs, entriesBefore };
}
async function saveAndReopen(page, expected, allowFailedPreview = false, expectedProject) {
  const at = performance.now();
  const writes = await page.evaluate(() => window.auditFile.writes);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await page.waitForFunction((writes) => window.auditFile.writes > writes, writes, { timeout: 30_000 });
  const saveMs = performance.now() - at;
  const bytes = new Uint8Array(await page.evaluate(() => window.auditFile.saved));
  const project =
    codec.decodeEnvelope(bytes).version === 2
      ? (await codec.decodeProject(bytes)).project
      : { diagrams: [{ document: (await codec.decodeDocument(bytes)).document }] };
  if (expected && !project.diagrams.some((d) => d.document.current.source.includes(expected)))
    throw new Error("Saved source is missing expected content");
  if (allowFailedPreview && !project.diagrams.some((d) => d.document.current.source === expected))
    throw new Error("Oversized fixture source changed during save");
  if (expectedProject) {
    for (const member of expectedProject.diagrams) {
      const savedMember = project.diagrams.find((d) => d.id === member.id);
      if (savedMember?.document.current.source !== member.document.current.source)
        throw new Error(`Saved member source differs: ${member.name}`);
      const originalContents = await codec.reconstructContents(member.document.contents);
      const savedContents = await codec.reconstructContents(savedMember.document.contents);
      for (const version of member.document.versions) {
        const savedVersion = savedMember.document.versions.find((saved) => saved.id === version.id);
        const originalSource = originalContents.get(version.contentId);
        const savedSource = savedVersion && savedContents.get(savedVersion.contentId);
        if (
          !savedVersion ||
          typeof originalSource !== "string" ||
          typeof savedSource !== "string" ||
          ["createdAt", "sequence", "reason", "pinned", "diagramKind"].some(
            (key) => savedVersion[key] !== version[key],
          ) ||
          originalSource !== savedSource
        )
          throw new Error(`Saved revision differs: ${member.name} / ${version.id}`);
      }
    }
    for (const link of expectedProject.links)
      if (
        !project.links.some(
          (saved) =>
            saved.id === link.id && saved.from === link.from && saved.to === link.to && saved.kind === link.kind,
        )
      )
        throw new Error(`Saved link differs: ${link.id}`);
  }
  const began = performance.now();
  const after = await page.evaluate(() => window.audit.renders.length);
  await openFile(page, bytes, "saved-audit.pumlu");
  // Reopening a cached identical source need not create a renderer result.
  if (codec.decodeEnvelope(bytes).version === 2)
    await expect(page.getByRole("complementary", { name: "Document navigator", exact: true })).toContainText(
      project.name,
      { timeout: 30_000 },
    );
  else
    await expect(page.locator('.document-tabs > button[title*="saved-audit.pumlu"]').first()).toBeVisible({
      timeout: 30_000,
    });
  if (allowFailedPreview)
    await expect(page.locator(".preview[data-render-status]")).toHaveAttribute("data-render-status", "error", {
      timeout: 65_000,
    });
  else await expect(page.locator(".statusbar")).toContainText("Preview current", { timeout: 65_000 });
  return {
    saveMs,
    reopenMs: performance.now() - began,
    bytes: bytes.length,
    diagrams: project.diagrams.length,
    links: project.links?.length ?? 0,
    allFixtureMembersAndLinksPreserved: expectedProject ? true : undefined,
    originalHistoryVersionsVerified: expectedProject?.diagrams.reduce(
      (n, member) => n + member.document.versions.length,
      0,
    ),
    historyVersions: project.diagrams.reduce((n, d) => n + d.document.versions.length, 0),
    renderResultsAfterReopen: await page.evaluate((after) => window.audit.renders.length - after, after),
  };
}

const report = {
  startedAtUtc: new Date().toISOString(),
  origin,
  runs,
  machine: {
    platform: os.platform(),
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.version,
  },
  cases: [],
};
let activeBrowser, activeCase;
for (activeBrowser of process.argv.slice(2).length ? process.argv.slice(2) : ["chromium"]) {
  const browser = await { chromium, firefox, webkit }[activeBrowser].launch();
  try {
    for (const item of selected) {
      activeCase = item.name;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const record = {
        browser: activeBrowser,
        browserVersion: browser.version(),
        name: item.name,
        sourceBytes: item.source ? Buffer.byteLength(item.source) : undefined,
        fileBytes: item.bytes?.length,
        registeredEndpoints: item.project?.elements.length,
        links: item.project?.links.length,
        lines: item.source?.split("\n").length,
        timings: [],
        errors: [],
      };
      page.on("pageerror", (e) => record.errors.push(e.message));
      console.log(`START ${activeBrowser} ${item.name}`);
      const stage = (name) => {
        record.stage = name;
        console.log(`STAGE ${activeBrowser} ${item.name} ${name}`);
      };
      try {
        await instruments(page);
        stage("startup");
        await prepare(page);
        if (item.kind !== "gantt" && item.kind !== "project") {
          await page.getByRole("button", { name: "New diagram tab", exact: true }).click();
          await page
            .getByRole("dialog", { name: "Choose a diagram type" })
            .getByRole("button", {
              name: `${item.kind === "wbs" ? "WBS" : item.kind[0].toUpperCase() + item.kind.slice(1)} diagram`,
              exact: true,
            })
            .click();
          await expect(page.locator(".statusbar")).toContainText("Preview current", { timeout: 65_000 });
        }
        stage("initial-load");
        const profiler =
          process.env.LARGE_DOCUMENT_PROFILE && activeBrowser === "chromium"
            ? await context.newCDPSession(page)
            : undefined;
        if (profiler) {
          await profiler.send("Profiler.enable");
          await profiler.send("Profiler.start");
        }
        const clock = await page.evaluate(() => performance.now());
        let after = await page.evaluate(() => window.audit.renders.length);
        let began = performance.now();
        if (item.bytes) record.fileOpen = await openFile(page, item.bytes, `${item.name}.pumlu`);
        else await replace(page, item.source);
        const marker = item.kind === "project" ? "Delivery task 30" : item.search;
        const result = await settle(page, after, marker);
        record.initial = { wallMs: performance.now() - began, ...result, ...(await sample(page, clock)) };
        if (profiler) {
          const { profile } = await profiler.send("Profiler.stop");
          await writeFile(resolve(output, `${activeBrowser}-${item.name}.cpuprofile`), JSON.stringify(profile));
          const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
          const self = new Map();
          profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
          record.mainThreadProfile = [...self]
            .map(([id, selfMs]) => ({
              function: nodes.get(id).callFrame.functionName,
              url: nodes.get(id).callFrame.url,
              line: nodes.get(id).callFrame.lineNumber + 1,
              selfMs,
            }))
            .sort((a, b) => b.selfMs - a.selfMs)
            .slice(0, 30);
          await profiler.detach();
        }
        await page.screenshot({ path: resolve(output, `${activeBrowser}-${item.name}.png`) });
        if (!item.bytes && item.name !== "existing-project") {
          for (let run = 0; run < runs; run++) {
            stage(`edit-${run}`);
            const runClock = await page.evaluate(() => performance.now());
            after = await page.evaluate(() => window.audit.renders.length);
            const title = `title Audit ${item.name} iteration ${run}`;
            began = performance.now();
            const editor = page.locator(".cm-content");
            await editor.focus();
            await page.keyboard.press("ControlOrMeta+Home");
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Home");
            await page.keyboard.press("Shift+End");
            await page.keyboard.insertText(title);
            const render = await settle(page, after, `Audit ${item.name} iteration ${run}`);
            record.timings.push({ wallMs: performance.now() - began, ...render, ...(await sample(page, runClock)) });
          }
        }
        stage("outline");
        record.outline = await outline(page, item.search);
        if (item.name === "gantt-500") {
          stage("table-edit-undo");
          began = performance.now();
          await page
            .getByRole("navigation", { name: "View mode", exact: true })
            .getByRole("button", { name: "Tasks", exact: true })
            .click();
          const table = page.getByRole("region", { name: "Gantt task table", exact: true });
          await table.waitFor();
          record.table = {
            openMs: performance.now() - began,
            initiallyMountedRows: await table.locator("tr[data-task-row]").count(),
          };
          const first = table.locator('tr[data-task-row="t0"]');
          await first.getByRole("textbox", { name: "Progress (%)", exact: true }).fill("75");
          after = await page.evaluate(() => window.audit.renders.length);
          began = performance.now();
          await table.getByRole("button", { name: "Apply changes", exact: true }).click();
          await settle(page, after, "Delivery task 500");
          record.table.applyMs = performance.now() - began;
          await expect(first.getByRole("textbox", { name: "Progress (%)", exact: true })).toHaveValue("75");
          await page.getByRole("button", { name: "Undo", exact: true }).click();
          await expect(first.getByRole("textbox", { name: "Progress (%)", exact: true })).toHaveValue("0");
          record.table.undoRestoredProgress = true;
          await page
            .getByRole("navigation", { name: "View mode", exact: true })
            .getByRole("button", { name: "Split", exact: true })
            .click();
        }
        if (item.bytes) {
          stage("member-switching");
          record.memberSwitches = [];
          const navigator = page.getByRole("complementary", { name: "Document navigator", exact: true });
          stage("link-selector");
          const linksPanel = navigator.getByRole("region", { name: "Links between diagram items", exact: true });
          const fromSelect = linksPanel.getByRole("combobox", { name: "1. Link from", exact: true });
          const sourceSearch = linksPanel.getByRole("searchbox", { name: "Search link from items", exact: true });
          await sourceSearch.waitFor();
          if ((await fromSelect.locator("option").count()) > 102) throw new Error("Unbounded source selector");
          await linksPanel.getByRole("button", { name: "Next link from items", exact: true }).click();
          const wbsMembers = item.project.diagrams.filter((member) => member.document.current.diagramKind === "wbs");
          const sourceMember = wbsMembers.at(-1);
          const targetMember = wbsMembers.at(-2);
          const sourceElement = item.project.elements.find((element) => element.documentId === sourceMember.id);
          const targetElement = item.project.elements.find((element) => element.documentId === targetMember.id);
          await sourceSearch.fill(`${sourceMember.name}:`);
          await fromSelect.selectOption(sourceElement.id);
          const toSelect = linksPanel.getByRole("combobox", { name: "2. Link to", exact: true });
          await linksPanel
            .getByRole("searchbox", { name: "Search link to items", exact: true })
            .fill(`${targetMember.name}:`);
          await toSelect.selectOption(targetElement.id);
          await linksPanel.getByRole("button", { name: "Create WBS link", exact: true }).click();
          const removeLinks = linksPanel.getByRole("button", { name: "Remove", exact: true });
          await expect(removeLinks).toHaveCount(item.project.links.length + 1);
          await removeLinks.last().click();
          await expect(removeLinks).toHaveCount(item.project.links.length);
          await sourceSearch.fill("");
          await expect(fromSelect).toHaveValue(sourceElement.id);
          record.linkSelector = {
            paged: true,
            searchedLateMembers: true,
            createdAndRemovedLink: true,
            selectionRetained: true,
          };
          stage("document-search");
          const search = navigator.getByRole("searchbox", { name: "Find diagrams by name or type" });
          const lateMember = item.project.diagrams.at(-1);
          const searchStarted = performance.now();
          await search.fill(lateMember.name);
          await expect(
            navigator.getByRole("button", { name: `Inspect diagram ${lateMember.name}`, exact: true }),
          ).toBeVisible();
          const beforeMemberRender = await page.evaluate(() => window.audit.renders.length);
          await navigator.getByRole("button", { name: `Inspect diagram ${lateMember.name}`, exact: true }).click();
          const memberMarker = {
            gantt: "Delivery task 20",
            sequence: "Service 8",
            class: "Entity12",
            wbs: "Deliverable 25",
          }[lateMember.document.current.diagramKind];
          await settle(page, beforeMemberRender, memberMarker);
          await expect(page.locator(".document-tabs > button.active")).toContainText(lateMember.name);
          record.documentSearch = { name: lateMember.name, searchAndOpenMs: performance.now() - searchStarted };
          await search.fill("no matching diagram audit");
          await expect(navigator.getByText("No diagrams match this search.", { exact: true })).toBeVisible();
          await navigator.getByRole("button", { name: "Clear diagram search", exact: true }).click();
          await expect(navigator.getByRole("button", { name: /^Inspect diagram / })).toHaveCount(
            item.project.diagrams.length,
          );
          record.documentSearch.clearRestoredAllMembers = true;
          stage("member-switching");
          for (const member of item.project.diagrams.slice(-3)) {
            began = performance.now();
            await navigator.getByRole("button", { name: `Inspect diagram ${member.name}`, exact: true }).click();
            const switchMarker = {
              gantt: "Delivery task 20",
              sequence: "Service 8",
              class: "Entity12",
              wbs: "Deliverable 25",
            }[member.document.current.diagramKind];
            await expect(page.locator(".document-tabs > button.active")).toContainText(member.name);
            await expect(page.locator(".diagram svg")).toContainText(switchMarker, { timeout: 65_000 });
            await expect(page.locator(".statusbar")).toContainText("Preview current", { timeout: 65_000 });
            await page.evaluate(
              () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
            );
            record.memberSwitches.push({ name: member.name, wallMs: performance.now() - began });
          }
          stage("project-edit-undo");
          const firstMember = item.project.diagrams[0];
          await navigator.getByRole("button", { name: `Inspect diagram ${firstMember.name}`, exact: true }).click();
          await expect(page.locator(".document-tabs > button.active")).toContainText(firstMember.name);
          await expect(page.locator(".diagram svg")).toContainText("Delivery task 30", { timeout: 65_000 });
          const editor = page.locator(".cm-content");
          const originalTitle = firstMember.document.current.source.split("\n")[1];
          record.projectEdits = [];
          for (let edit = 0; edit < 2; edit++) {
            const title = `title Portfolio edit audit ${edit}`;
            await editor.focus();
            await page.keyboard.press("ControlOrMeta+Home");
            await page.keyboard.press("ArrowDown");
            await page.keyboard.press("Home");
            await page.keyboard.press("Shift+End");
            const beforeRender = await page.evaluate(() => window.audit.renders.length);
            const editClock = await page.evaluate(() => performance.now());
            const editStarted = performance.now();
            await page.keyboard.insertText(title);
            const render = await settle(page, beforeRender, `Portfolio edit audit ${edit}`);
            const editMs = performance.now() - editStarted;
            await expect(navigator.locator(".project-index-status")).toHaveText("Links current", { timeout: 30_000 });
            const previewAndIndexReadyMs = performance.now() - editStarted;
            const editSample = await sample(page, editClock);
            const undoStarted = performance.now();
            await editor.press("ControlOrMeta+z");
            await expect(editor).toContainText(originalTitle);
            await expect(page.locator(".diagram svg")).not.toContainText(`Portfolio edit audit ${edit}`);
            await expect(page.locator(".statusbar")).toContainText("Preview current", { timeout: 65_000 });
            await expect(navigator.locator(".project-index-status")).toHaveText("Links current", { timeout: 30_000 });
            record.projectEdits.push({
              editMs,
              previewAndIndexReadyMs,
              engineMs: render.engineMs,
              undoMs: performance.now() - undoStarted,
              ...editSample,
            });
          }
        }
        stage("save-reopen");
        record.persistence = await saveAndReopen(
          page,
          item.kind === "project" ? "Delivery task 30" : item.search,
          false,
          item.project,
        );
        record.ok = true;
      } catch (error) {
        record.ok = false;
        record.failure = error.message;
        record.statusAtFailure = await page
          .locator(".statusbar")
          .innerText()
          .catch(() => "unavailable");
        await page.screenshot({ path: resolve(output, `${activeBrowser}-${item.name}-failure.png`) }).catch(() => {});
        if (record.failure.startsWith("Renderer:") && item.source) {
          try {
            await expect(page.getByRole("alert", { name: "Preview size limit", exact: true })).toBeVisible();
            record.sizeLimitGuidance = true;
            await page
              .getByRole("alert", { name: "Preview size limit", exact: true })
              .getByRole("button", { name: "Continue editing", exact: true })
              .click();
            stage("oversized-source-survival");
            record.outline = await outline(page, item.search);
            if (item.name === "gantt-500") {
              await page
                .getByRole("navigation", { name: "View mode", exact: true })
                .getByRole("button", { name: "Tasks", exact: true })
                .click();
              const table = page.getByRole("region", { name: "Gantt task table", exact: true });
              record.table = { initiallyMountedRows: await table.locator("tr[data-task-row]").count() };
              const first = table.locator('tr[data-task-row="t0"]');
              await first.getByRole("textbox", { name: "Progress (%)", exact: true }).fill("75");
              await table.getByRole("button", { name: "Apply changes", exact: true }).click();
              await expect(first.getByRole("textbox", { name: "Progress (%)", exact: true })).toHaveValue("75");
              await page.getByRole("button", { name: "Undo", exact: true }).click();
              await expect(first.getByRole("textbox", { name: "Progress (%)", exact: true })).toHaveValue("0");
              record.table.undoRestoredProgress = true;
              const expandAt = performance.now();
              while (await table.getByRole("button", { name: /^Show more tasks/ }).isVisible())
                await table.getByRole("button", { name: /^Show more tasks/ }).click();
              record.table.expandAllMs = performance.now() - expandAt;
              record.table.expandedRows = await table.locator("tr[data-task-row]").count();
              const last = table.locator('tr[data-task-row="t499"]');
              await last.getByRole("textbox", { name: "Progress (%)", exact: true }).fill("75");
              await table.getByRole("button", { name: "Apply changes", exact: true }).click();
              await expect(last.getByRole("textbox", { name: "Progress (%)", exact: true })).toHaveValue("75");
              await page.getByRole("button", { name: "Undo", exact: true }).click();
              await expect(last.getByRole("textbox", { name: "Progress (%)", exact: true })).toHaveValue("80");
              record.table.lastTaskEditUndo = true;
              await page
                .getByRole("navigation", { name: "View mode", exact: true })
                .getByRole("button", { name: "Split", exact: true })
                .click();
            }
            record.persistence = await saveAndReopen(page, item.source, true);
            record.persistence.exactFixtureSourcePreserved = true;
            const recovery =
              item.kind === "gantt"
                ? "@startgantt\ntitle Recovery\n[Recovered] lasts 2 days\n@endgantt"
                : item.kind === "wbs"
                  ? "@startwbs\n* Recovered\n@endwbs"
                  : item.kind === "class"
                    ? "@startuml\nclass Recovered\n@enduml"
                    : "@startuml\nAlice -> Bob: Recovered\n@enduml";
            const after = await page.evaluate(() => window.audit.renders.length);
            await replace(page, recovery);
            await settle(page, after, "Recovered");
            record.smallerDocumentRecovered = true;
          } catch (survivalError) {
            record.survivalFailure = survivalError.message;
          }
        }
      } finally {
        report.cases.push(record);
        await writeFile(
          resolve(output, process.env.LARGE_DOCUMENT_REPORT ?? "results.json"),
          JSON.stringify(report, null, 2),
        );
        console.log(
          JSON.stringify({
            browser: activeBrowser,
            name: item.name,
            ok: record.ok,
            initialMs: record.initial?.wallMs,
            failure: record.failure,
          }),
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
console.log(`Results: ${resolve(output, process.env.LARGE_DOCUMENT_REPORT ?? "results.json")}`);
