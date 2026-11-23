// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectLinkTarget, reviewBadge, targetOfOrigin } from "./git-hosts";
import { createOrigin } from "./git-origin";

const TOKEN = "glpat-unit-test-token-1234567890";
const OTHER_TOKEN = "glpat-other-server-token-0987654321";
const GITLAB = "https://gitlab.com";
const SELF = "https://gitlab.example.com";

async function freshModule() {
  vi.resetModules();
  return import("./gitlab-settings");
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

describe("GitLab token storage", () => {
  it("starts with no token and gitlab.com as the server", async () => {
    const gitlab = await freshModule();
    expect(gitlab.getGitLabState()).toEqual({ server: GITLAB, servers: [], remembered: [] });
    expect(gitlab.getGitLabToken(GITLAB)).toBeUndefined();
  });

  it("keeps a token per server and hands it out only for that server", async () => {
    const gitlab = await freshModule();
    expect(await gitlab.saveGitLabToken(GITLAB, `  ${TOKEN}  `, false)).toBe(true);
    expect(await gitlab.saveGitLabToken(`${SELF}/`, OTHER_TOKEN, false)).toBe(true);
    expect(gitlab.getGitLabToken(GITLAB)).toBe(TOKEN);
    expect(gitlab.getGitLabToken(SELF)).toBe(OTHER_TOKEN);
    expect(gitlab.getGitLabToken("https://evil.example.com")).toBeUndefined();
    expect(gitlab.getGitLabState().servers).toEqual([SELF, GITLAB].sort());
    expect(gitlab.getGitLabState().server).toBe(SELF);
  });

  it("keeps a session token in memory only: gone after a reload, nowhere on disk", async () => {
    const gitlab = await freshModule();
    await gitlab.saveGitLabToken(GITLAB, TOKEN, false);
    expect(await everythingInIndexedDb()).not.toContain(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    const reloaded = await freshModule();
    await reloaded.loadRememberedGitLabTokens();
    expect(reloaded.getGitLabToken(GITLAB)).toBeUndefined();
  });

  it("remembers only the servers asked for, and loads them after a reload", async () => {
    const gitlab = await freshModule();
    await gitlab.saveGitLabToken(GITLAB, TOKEN, true);
    await gitlab.saveGitLabToken(SELF, OTHER_TOKEN, false);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(OTHER_TOKEN);
    const stored = await everythingInIndexedDb();
    expect(stored).toContain(TOKEN);
    expect(stored).not.toContain(OTHER_TOKEN);
    const reloaded = await freshModule();
    expect(reloaded.getGitLabState().remembered).toEqual([GITLAB]);
    expect(reloaded.getGitLabState().servers).toEqual([]);
    await reloaded.loadRememberedGitLabTokens();
    expect(reloaded.getGitLabToken(GITLAB)).toBe(TOKEN);
    expect(reloaded.getGitLabToken(SELF)).toBeUndefined();
  });

  it("forgets one server's token from memory and from the device, and keeps the other", async () => {
    const gitlab = await freshModule();
    await gitlab.saveGitLabToken(GITLAB, TOKEN, true);
    await gitlab.saveGitLabToken(SELF, OTHER_TOKEN, true);
    await gitlab.forgetGitLabToken(GITLAB);
    expect(gitlab.getGitLabToken(GITLAB)).toBeUndefined();
    expect(gitlab.getGitLabToken(SELF)).toBe(OTHER_TOKEN);
    const stored = await everythingInIndexedDb();
    expect(stored).not.toContain(TOKEN);
    expect(stored).toContain(OTHER_TOKEN);
  });

  it("refuses an address that is not https, and an empty token", async () => {
    const gitlab = await freshModule();
    const listener = vi.fn();
    gitlab.subscribeGitLab(listener);
    expect(await gitlab.saveGitLabToken("http://gitlab.example.com", TOKEN, false)).toBe(false);
    expect(await gitlab.saveGitLabToken("https://gitlab.example.com/sub", TOKEN, false)).toBe(false);
    expect(await gitlab.saveGitLabToken(GITLAB, "   ", true)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(gitlab.getGitLabState().servers).toEqual([]);
  });

  it("is read by no code outside features/git (documents, exports, snapshots, sharing, collaboration, workers)", () => {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const root = path.resolve(here, "../../../../..");
    const own = path.join(root, "apps/web/src/features/git");
    const offenders: string[] = [];
    const visit = (directory: string) => {
      for (const name of readdirSync(directory)) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        const full = path.join(directory, name);
        if (statSync(full).isDirectory()) {
          if (full !== own) visit(full);
        } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) {
          const text = readFileSync(full, "utf8");
          if (/getGitLabToken|git\/gitlab-settings|plantuml-studio-gitlab|plantuml-studio\.gitlab/.test(text))
            offenders.push(path.relative(root, full));
        }
      }
    };
    for (const folder of ["apps", "packages"]) visit(path.join(root, folder));
    expect(offenders).toEqual([]);
  });
});

describe("git hosts", () => {
  it("picks the host of a pasted link", () => {
    expect(detectLinkTarget("https://github.com/o/r/blob/main/a.puml")).toEqual({ provider: "github" });
    expect(detectLinkTarget("https://raw.githubusercontent.com/o/r/main/a.puml")).toEqual({ provider: "github" });
    expect(detectLinkTarget(`${SELF}/group/sub/project/-/blob/main/docs/a.puml`)).toEqual({
      provider: "gitlab",
      server: SELF,
    });
    expect(detectLinkTarget("http://gitlab.example.com/g/p/-/blob/main/a.puml")).toBeUndefined();
    expect(detectLinkTarget("https://example.com/a")).toBeUndefined();
    expect(detectLinkTarget("not a link")).toBeUndefined();
  });

  it("derives the host from a tab origin and words the request the way the host does", () => {
    const origin = createOrigin(
      { id: "gitlab", server: SELF },
      {
        owner: "g/s",
        repo: "p",
        ref: "main",
        path: "a.puml",
        version: "c".repeat(40),
        htmlUrl: `${SELF}/g/s/p/-/blob/main/a.puml`,
      },
    );
    expect(targetOfOrigin(origin)).toEqual({ provider: "gitlab", server: SELF });
    expect(
      targetOfOrigin({ owner: "o", repo: "r", ref: "main", path: "a", sha: "1", htmlUrl: "https://github.com/o/r" }),
    ).toEqual({
      provider: "github",
    });
    expect(reviewBadge("gitlab", 12)).toBe("MR !12");
    expect(reviewBadge("github", 12)).toBe("PR #12");
  });
});
