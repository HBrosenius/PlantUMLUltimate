/* global process, console, crypto, TextEncoder, TextDecoder, setTimeout, clearTimeout */
// Read-only audit reproductions. These assert observed defects, not desired behavior.
// Run from the repository root: node docs/audits/probes/2026-10-07-core.mjs
import { build } from "esbuild";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { IDBFactory } from "fake-indexeddb";

const bundle = await build({
  stdin: {
    contents: `export * from './apps/web/src/gantt-calendar';
    export * from './apps/web/src/gantt-schedule';
    export { parseGantt } from './packages/diagram-gantt/src/parser';
    export * from './apps/web/src/workspace-storage';
    export * from './apps/web/src/workspace-backup'; export { SharedDocumentModel } from './apps/web/src/collaboration-document'; export * as Y from 'yjs';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  external: ["react"],
});
const record = { exports: {} };
const storage = new Map();
const context = vm.createContext({
  module: record,
  exports: record.exports,
  require: createRequire(import.meta.url),
  console,
  crypto,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  indexedDB: new IDBFactory(),
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
});
vm.runInContext(bundle.outputFiles[0].text, context, { timeout: 2000 });
const api = record.exports;
const report = [];
const check = (name, action) => {
  action();
  report.push({ name, reproduced: true });
};
check("Huge relative date throws RangeError", () =>
  assert.throws(() => api.resolveDateExpression("D+999999999999999999", "2026-09-01"), /Invalid time value/),
);
check("Closed-week calendar exceeds 100ms execution budget", () => {
  const calendar = api.parseGanttCalendar(
    "sunday are closed\nmonday are closed\ntuesday are closed\nwednesday are closed\nthursday are closed\nfriday are closed\nsaturday are closed",
  );
  assert.throws(
    () => vm.runInNewContext("api.workingEndDate('2026-09-01', 1, calendar)", { api, calendar }, { timeout: 100 }),
    /timed out/,
  );
});
check("Impossible dates silently normalize", () => assert.equal(api.shiftDate("2026-02-31", 0), "2026-03-03"));
check("Parser accepts infinite task duration", () =>
  assert.equal(
    api.parseGantt(`@startgantt\n[A] lasts ${"9".repeat(400)} days\n@endgantt`).document.tasks[0].duration.value,
    Infinity,
  ),
);
const session = (source) => ({
  ...api.DEFAULT_SESSION,
  onboarded: true,
  documents: [{ ...api.DEFAULT_SESSION.documents[0], source }],
});
await api.saveWorkspace(session("WINDOW A"));
await api.saveWorkspace(session("WINDOW B"));
assert.equal((await api.loadWorkspace()).documents[0].source, "WINDOW B");
report.push({ name: "Windows write the same recovery record", reproduced: true });
check("Error-boundary backup cannot be restored by backup parser", () =>
  assert.throws(() => api.parseWorkspaceBackup(JSON.stringify(session("saved"))), /not a supported/),
);
const oversized = JSON.stringify({
  kind: "plantuml-studio-workspace",
  version: 1,
  session: session("x".repeat(6_000_000)),
});
check("Workspace backup accepts 6-million-character source without bounds", () =>
  assert.equal(api.parseWorkspaceBackup(oversized).documents[0].source.length, 6_000_000),
);
check("Backup accepts shared history IDs for distinct documents", () => {
  const first = { ...session("FIRST").documents[0], id: "first", historyId: "shared" };
  const second = { ...first, id: "second", source: "SECOND" };
  const parsed = api.parseWorkspaceBackupBundle(
    JSON.stringify({
      kind: "plantuml-studio-workspace",
      version: 1,
      session: { ...session(""), activeDocumentId: "first", documents: [first, second] },
    }),
  );
  const restored = api.prepareWorkspaceRestore(parsed);
  assert.equal(restored.session.documents[0].historyId, restored.session.documents[1].historyId);
});
await api.saveWorkspace(session("OLD INDEXEDDB"));
const workingDatabase = context.indexedDB;
const workingSet = context.localStorage.setItem;
context.localStorage.setItem = (key, value) => {
  if (key === "plantuml-studio.workspace.recovery.v6") throw new Error("Recovery quota failure");
  workingSet(key, value);
};
context.indexedDB = {
  open() {
    throw new Error("Transient IndexedDB failure");
  },
};
await api.saveWorkspace(session("NEW FALLBACK"));
context.indexedDB = workingDatabase;
context.localStorage.setItem = workingSet;
assert.equal((await api.loadWorkspace()).documents[0].source, "OLD INDEXEDDB");
report.push({ name: "Old IndexedDB wins over newer successful local fallback", reproduced: true });
context.indexedDB = { open: () => ({}) };
storage.clear();
const pending = await Promise.race([
  api.loadWorkspace().then(() => "resolved"),
  new Promise((resolve) => setTimeout(() => resolve("pending"), 150)),
]);
assert.equal(pending, "pending");
report.push({
  name: "Unresponsive IndexedDB leaves recovery pending (150ms probe; no deadline in source)",
  reproduced: true,
});
check("Valid Yjs with malformed diagram schema crashes shared snapshot", () => {
  const document = new api.Y.Doc();
  document.getMap("document-metadata").set("id", "audit");
  document.getMap("document-metadata").set("name", "Audit");
  document.getMap("document-diagrams").set("bad", "not-a-map");
  const received = new api.Y.Doc();
  api.Y.applyUpdate(received, api.Y.encodeStateAsUpdate(document));
  assert.throws(() => new api.SharedDocumentModel(received).snapshot, /not a function/);
});
console.log(JSON.stringify(report, null, 2));
