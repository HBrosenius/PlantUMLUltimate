// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION } from "../../workspace-storage";
import { serializeWorkspaceBackup } from "../../workspace-backup";

const KEY = "sk-ant-api03-unit-test-key";

async function freshModule() {
  vi.resetModules();
  return import("./ai-settings");
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

describe("AI assistant settings", () => {
  it("is off by default, with no key and the default model", async () => {
    const ai = await freshModule();
    expect(ai.getAiAssistantState()).toEqual({
      enabled: false,
      consentedAt: undefined,
      model: "claude-opus-5-5",
      remember: false,
      hasKey: false,
    });
    expect(ai.isAiAssistantReady()).toBe(false);
  });

  it("is ready only after consent, enabling and a key, and records when consent was given", async () => {
    const ai = await freshModule();
    await ai.saveAiKey(KEY, false);
    expect(ai.isAiAssistantReady()).toBe(false);
    ai.enableAiAssistant();
    expect(ai.getAiAssistantState().consentedAt).toBeTruthy();
    expect(ai.isAiAssistantReady()).toBe(true);
    ai.disableAiAssistant();
    expect(ai.isAiAssistantReady()).toBe(false);
  });

  it("ignores stored 'enabled' without a recorded consent and unknown models", async () => {
    localStorage.setItem(
      "plantuml-studio.ai-assistant",
      JSON.stringify({ enabled: true, model: "claude-imaginary", remember: false }),
    );
    const ai = await freshModule();
    expect(ai.getAiAssistantState()).toMatchObject({ enabled: false, model: "claude-opus-5-5" });
    ai.setAiModel("claude-sonnet-5-5");
    ai.setAiModel("not-a-model");
    expect(ai.getAiAssistantState().model).toBe("claude-sonnet-5-5");
  });

  it("keeps the key in memory only by default", async () => {
    const ai = await freshModule();
    await ai.saveAiKey(`  ${KEY}  `, false);
    expect(ai.getAiKey()).toBe(KEY);
    expect(await everythingInIndexedDb()).not.toContain(KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
    const reloaded = await freshModule();
    await reloaded.loadRememberedAiKey();
    expect(reloaded.getAiKey()).toBeUndefined();
  });

  it("remembers the key on this device only when asked, and forgets it everywhere", async () => {
    const ai = await freshModule();
    expect(await ai.saveAiKey(KEY, true)).toBe(true);
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
    expect(await everythingInIndexedDb()).toContain(KEY);

    const reloaded = await freshModule();
    expect(reloaded.getAiKey()).toBeUndefined();
    await reloaded.loadRememberedAiKey();
    expect(reloaded.getAiKey()).toBe(KEY);
    expect(reloaded.getAiAssistantState()).toMatchObject({ hasKey: true, remember: true });

    await reloaded.forgetAiKey();
    expect(reloaded.getAiKey()).toBeUndefined();
    expect(await everythingInIndexedDb()).not.toContain(KEY);
    const again = await freshModule();
    await again.loadRememberedAiKey();
    expect(again.getAiKey()).toBeUndefined();
    expect(again.getAiAssistantState().remember).toBe(false);
  });

  it("switching from remembered to session-only removes the stored copy", async () => {
    const ai = await freshModule();
    await ai.saveAiKey(KEY, true);
    await ai.saveAiKey(KEY, false);
    expect(await everythingInIndexedDb()).not.toContain(KEY);
  });

  it("rejects an empty key", async () => {
    const ai = await freshModule();
    expect(await ai.saveAiKey("   ", true)).toBe(false);
    expect(ai.getAiAssistantState().hasKey).toBe(false);
  });
});

describe("the API key never leaves the AI assistant module", () => {
  it("does not appear in backups or any other browser storage", async () => {
    const ai = await freshModule();
    ai.enableAiAssistant();
    await ai.saveAiKey(KEY, true);
    expect(serializeWorkspaceBackup(DEFAULT_SESSION)).not.toContain(KEY);
    expect(JSON.stringify({ ...localStorage })).not.toContain(KEY);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(KEY);
    const databases = (await indexedDB.databases()).map((entry) => entry.name);
    expect(databases).toEqual(["plantuml-studio-ai-assistant"]);
  });

  it("is read by no code outside features/ai-edits (documents, exports, sharing, collaboration, workers)", () => {
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    const root = path.resolve(here, "../../../../..");
    const own = path.join(root, "apps/web/src/features/ai-edits");
    const offenders: string[] = [];
    const visit = (directory: string) => {
      for (const name of readdirSync(directory)) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        const full = path.join(directory, name);
        if (statSync(full).isDirectory()) {
          if (full !== own) visit(full);
        } else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) {
          const text = readFileSync(full, "utf8");
          if (/getAiKey|ai-edits\/ai-settings|plantuml-studio-ai-assistant|plantuml-studio\.ai-assistant/.test(text))
            offenders.push(path.relative(root, full));
        }
      }
    };
    for (const folder of ["apps", "packages"]) visit(path.join(root, folder));
    expect(offenders).toEqual([]);
  });
});
