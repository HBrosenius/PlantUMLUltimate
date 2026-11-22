// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SESSION } from "../../workspace-storage";
import { serializeWorkspaceBackup } from "../../workspace-backup";

const KEY = "sk-ant-api03-unit-test-key";
const OPENAI_KEY = "sk-proj-openai-unit-test-key";
const XAI_KEY = "xai-unit-test-key";

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
      provider: "anthropic",
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

  it("ignores stored 'enabled' without a recorded consent and invalid model ids, and accepts custom ids", async () => {
    localStorage.setItem(
      "plantuml-studio.ai-assistant",
      JSON.stringify({ enabled: true, model: "not a model!", remember: false }),
    );
    const ai = await freshModule();
    expect(ai.getAiAssistantState()).toMatchObject({ enabled: false, model: "claude-opus-5-5" });
    ai.setAiModel("claude-sonnet-5-5");
    ai.setAiModel("not a model!");
    expect(ai.getAiAssistantState().model).toBe("claude-sonnet-5-5");
    ai.setAiModel("claude-future-9");
    expect(ai.getAiAssistantState().model).toBe("claude-future-9");
  });

  it("migrates the Anthropic-only stored shape without losing consent, model or the remember choice", async () => {
    localStorage.setItem(
      "plantuml-studio.ai-assistant",
      JSON.stringify({
        enabled: true,
        consentedAt: "2026-11-01T10:00:00.000Z",
        model: "claude-sonnet-5-5",
        remember: true,
      }),
    );
    const ai = await freshModule();
    expect(ai.getAiAssistantState()).toEqual({
      enabled: true,
      provider: "anthropic",
      consentedAt: "2026-11-01T10:00:00.000Z",
      model: "claude-sonnet-5-5",
      remember: true,
      hasKey: false,
    });
    // The Anthropic key remembered under the original record name still loads.
    await ai.saveAiKey(KEY, true);
    const reloaded = await freshModule();
    await reloaded.loadRememberedAiKey();
    expect(reloaded.getAiKey()).toBe(KEY);
    // The next write uses the per-provider shape.
    reloaded.setAiProvider("openai");
    const stored = JSON.parse(localStorage.getItem("plantuml-studio.ai-assistant")!);
    expect(stored).toMatchObject({
      version: 2,
      provider: "openai",
      consents: { anthropic: "2026-11-01T10:00:00.000Z" },
    });
  });

  it("keeps provider, model, consent and key per provider", async () => {
    const ai = await freshModule();
    ai.enableAiAssistant();
    await ai.saveAiKey(KEY, false);
    ai.setAiProvider("openai");
    // Consent to one company is not consent to another: the assistant is not ready for OpenAI.
    expect(ai.getAiAssistantState()).toMatchObject({
      provider: "openai",
      model: "gpt-6.2-sol",
      consentedAt: undefined,
      hasKey: false,
    });
    expect(ai.isAiAssistantReady()).toBe(false);
    ai.setAiModel("gpt-6-luna");
    ai.enableAiAssistant();
    await ai.saveAiKey(OPENAI_KEY, false);
    expect(ai.isAiAssistantReady()).toBe(true);
    expect(ai.getAiKey()).toBe(OPENAI_KEY);
    expect(ai.getAiKey("anthropic")).toBe(KEY);
    ai.setAiProvider("xai");
    expect(ai.getAiAssistantState()).toMatchObject({ provider: "xai", model: "grok-4.7", hasKey: false });
    ai.setAiProvider("anthropic");
    expect(ai.getAiAssistantState()).toMatchObject({ model: "claude-opus-5-5", hasKey: true });
    const reloaded = await freshModule();
    expect(reloaded.getAiAssistantState().provider).toBe("anthropic");
    reloaded.setAiProvider("openai");
    expect(reloaded.getAiAssistantState().model).toBe("gpt-6-luna");
  });

  it("forgets one provider's key without touching the others", async () => {
    const ai = await freshModule();
    await ai.saveAiKey(KEY, true, "anthropic");
    await ai.saveAiKey(OPENAI_KEY, true, "openai");
    await ai.saveAiKey(XAI_KEY, true, "xai");
    await ai.forgetAiKey("openai");
    expect(ai.getAiKey("openai")).toBeUndefined();
    const dump = await everythingInIndexedDb();
    expect(dump).toContain(KEY);
    expect(dump).toContain(XAI_KEY);
    expect(dump).not.toContain(OPENAI_KEY);
    const reloaded = await freshModule();
    await reloaded.loadRememberedAiKey();
    expect(reloaded.getAiKey("anthropic")).toBe(KEY);
    expect(reloaded.getAiKey("xai")).toBe(XAI_KEY);
    expect(reloaded.getAiKey("openai")).toBeUndefined();
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
  it("no provider's key appears in backups, browser storage or any other IndexedDB database", async () => {
    const ai = await freshModule();
    ai.enableAiAssistant();
    const keys = { anthropic: KEY, openai: OPENAI_KEY, xai: XAI_KEY } as const;
    for (const [provider, key] of Object.entries(keys) as Array<[keyof typeof keys, string]>)
      await ai.saveAiKey(key, true, provider);
    // An unrelated database next to the assistant's, as the workspace has.
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("some-other-database", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("things");
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
    });
    const backup = serializeWorkspaceBackup(DEFAULT_SESSION);
    const other = (await everythingInIndexedDb())
      .split("\n")
      .filter((line) => !line.startsWith("plantuml-studio-ai-assistant/"))
      .join("\n");
    for (const key of Object.values(keys)) {
      expect(backup).not.toContain(key);
      expect(JSON.stringify({ ...localStorage })).not.toContain(key);
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(key);
      expect(other).not.toContain(key);
    }
    const databases = (await indexedDB.databases()).map((entry) => entry.name).sort();
    expect(databases).toEqual(["plantuml-studio-ai-assistant", "some-other-database"]);
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
