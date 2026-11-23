// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION, normalizeSession, type WorkspaceSession } from "../../workspace-storage";
import { serializeWorkspaceBackup } from "../../workspace-backup";
import { assemblePortableDocument } from "../../document-format/portable-document";
import { normalizeGitHubOrigin, type GitHubOrigin } from "./github-origin";

const TOKEN = "github_pat_unit_test_token_1234567890";

const ORIGIN: GitHubOrigin = {
  owner: "octo",
  repo: "diagrams",
  ref: "feature/x",
  path: "docs/system.puml",
  sha: "abc123",
  htmlUrl: "https://github.com/octo/diagrams/blob/feature/x/docs/system.puml",
};

async function freshModule() {
  vi.resetModules();
  return import("./github-settings");
}

async function everythingInIndexedDb(): Promise<string> {
  const names = (await indexedDB.databases()).map((entry) => entry.name!).filter(Boolean);
  const chunks: string[] = [];
  for (const name of names) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const storeName of Array.from(db.objectStoreNames)) {
      const values = await new Promise<unknown[]>((resolve) => {
        const request = db.transaction(storeName).objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
      });
      chunks.push(`${name}/${storeName}:${JSON.stringify(values)}`);
    }
    db.close();
  }
  return chunks.join("\n");
}

beforeEach(async () => {
  localStorage.clear();
  for (const entry of await indexedDB.databases()) indexedDB.deleteDatabase(entry.name!);
});

describe("GitHub token storage", () => {
  it("starts with no token and remembers nothing", async () => {
    const github = await freshModule();
    expect(github.getGitHubState()).toEqual({ remember: false, hasToken: false });
    expect(github.getGitHubToken()).toBeUndefined();
  });

  it("keeps a session token in memory only: gone after a reload, nowhere on disk", async () => {
    const github = await freshModule();
    expect(await github.saveGitHubToken(`  ${TOKEN}  `, false)).toBe(true);
    expect(github.getGitHubToken()).toBe(TOKEN);
    expect(github.getGitHubState()).toEqual({ remember: false, hasToken: true });
    expect(await everythingInIndexedDb()).not.toContain(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    const reloaded = await freshModule();
    await reloaded.loadRememberedGitHubToken();
    expect(reloaded.getGitHubToken()).toBeUndefined();
  });

  it("remembers the token on this device only when asked, and loads it after a reload", async () => {
    const github = await freshModule();
    await github.saveGitHubToken(TOKEN, true);
    expect(github.getGitHubState().remember).toBe(true);
    const reloaded = await freshModule();
    expect(reloaded.getGitHubState()).toEqual({ remember: true, hasToken: false });
    await reloaded.loadRememberedGitHubToken();
    expect(reloaded.getGitHubToken()).toBe(TOKEN);
    expect(reloaded.getGitHubState().hasToken).toBe(true);
  });

  it("switching 'remember' off removes the device copy", async () => {
    const github = await freshModule();
    await github.saveGitHubToken(TOKEN, true);
    await github.saveGitHubToken(TOKEN, false);
    expect(await everythingInIndexedDb()).not.toContain(TOKEN);
  });

  it("forgets the token from memory and from the device", async () => {
    const github = await freshModule();
    await github.saveGitHubToken(TOKEN, true);
    await github.forgetGitHubToken();
    expect(github.getGitHubToken()).toBeUndefined();
    expect(github.getGitHubState()).toEqual({ remember: false, hasToken: false });
    const reloaded = await freshModule();
    await reloaded.loadRememberedGitHubToken();
    expect(reloaded.getGitHubToken()).toBeUndefined();
    expect(await everythingInIndexedDb()).not.toContain(TOKEN);
  });

  it("ignores an empty token and notifies subscribers", async () => {
    const github = await freshModule();
    const listener = vi.fn();
    github.subscribeGitHub(listener);
    expect(await github.saveGitHubToken("   ", true)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    await github.saveGitHubToken(TOKEN, false);
    expect(listener).toHaveBeenCalled();
  });
});

describe("the GitHub token never leaves the GitHub feature", () => {
  it("is absent from backups, browser storage and every other IndexedDB database, and from a tab's own data", async () => {
    const github = await freshModule();
    await github.saveGitHubToken(TOKEN, true);
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("some-other-database", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("things");
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
    });
    const session: WorkspaceSession = {
      ...DEFAULT_SESSION,
      documents: DEFAULT_SESSION.documents.map((document) => ({ ...document, githubOrigin: ORIGIN })),
    };
    const backup = serializeWorkspaceBackup(session);
    const other = (await everythingInIndexedDb())
      .split("\n")
      .filter((line) => !line.startsWith("plantuml-studio-github/"))
      .join("\n");
    expect(backup).not.toContain(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
    expect(other).not.toContain(TOKEN);
    expect((await indexedDB.databases()).map((entry) => entry.name).sort()).toEqual([
      "plantuml-studio-github",
      "some-other-database",
    ]);
  });

  it("is read by no code outside features/github (documents, exports, snapshots, sharing, collaboration, workers)", () => {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const root = path.resolve(here, "../../../../..");
    const own = path.join(root, "apps/web/src/features/github");
    const offenders: string[] = [];
    const visit = (directory: string) => {
      for (const name of readdirSync(directory)) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        const full = path.join(directory, name);
        if (statSync(full).isDirectory()) {
          if (full !== own) visit(full);
        } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) {
          const text = readFileSync(full, "utf8");
          if (/getGitHubToken|github\/github-settings|plantuml-studio-github|plantuml-studio\.github/.test(text))
            offenders.push(path.relative(root, full));
        }
      }
    };
    for (const folder of ["apps", "packages"]) visit(path.join(root, folder));
    expect(offenders).toEqual([]);
  });
});

describe("a tab's GitHub origin", () => {
  it("survives recovery: normalizeSession keeps a complete origin and drops a malformed one", () => {
    const base = DEFAULT_SESSION.documents[0]!;
    const restored = normalizeSession({
      ...DEFAULT_SESSION,
      documents: [
        { ...base, id: "a", githubOrigin: ORIGIN },
        { ...base, id: "b", githubOrigin: { ...ORIGIN, htmlUrl: "javascript:alert(1)" } },
        { ...base, id: "c", githubOrigin: { owner: "x" } },
        { ...base, id: "d" },
      ],
    });
    expect(restored.documents.map((document) => document.githubOrigin)).toEqual([
      ORIGIN,
      undefined,
      undefined,
      undefined,
    ]);
    expect(normalizeGitHubOrigin(JSON.parse(JSON.stringify(ORIGIN)))).toEqual(ORIGIN);
  });

  it("is plain metadata in a workspace backup but is not written into a portable document", async () => {
    const document = { ...DEFAULT_SESSION.documents[0]!, githubOrigin: ORIGIN };
    const backup = serializeWorkspaceBackup({ ...DEFAULT_SESSION, documents: [document] });
    expect(backup).toContain("octo");
    const portable = await assemblePortableDocument(document, []);
    expect(JSON.stringify(portable)).not.toContain("octo/diagrams");
    expect(JSON.stringify(portable)).not.toContain("githubOrigin");
  });

  it("is not part of what collaboration, sharing, snapshots or exported documents read", () => {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const src = path.resolve(here, "../..");
    const mentions = (file: string) => /githubOrigin|GitHubOrigin/.test(readFileSync(path.join(src, file), "utf8"));
    for (const file of [
      "collaboration-document.ts",
      "collaboration-session.ts",
      "collaboration.ts",
      "use-collaboration-lifecycle.ts",
      "document-format/portable-document.ts",
    ])
      expect(mentions(file), file).toBe(false);
    for (const folder of ["features/snapshot"])
      for (const name of readdirSync(path.join(src, folder)))
        if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) expect(mentions(`${folder}/${name}`), name).toBe(false);
  });
});
