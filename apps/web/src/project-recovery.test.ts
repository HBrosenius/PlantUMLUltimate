import { it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
it("keeps project recovery and close state independent between windows", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  try {
    vi.stubGlobal("history", { state: { plantumlRecovery: "project-window-a" } });
    vi.resetModules();
    const first = await import("./workspace-storage");
    await first.saveActiveProject({ id: "first-project" });
    vi.stubGlobal("history", { state: { plantumlRecovery: "project-window-b" } });
    vi.resetModules();
    const second = await import("./workspace-storage");
    await second.saveActiveProject({ id: "second-project" });
    expect(await first.loadActiveProject()).toEqual({ id: "first-project" });
    await second.clearActiveProject();
    expect(await second.loadActiveProject()).toBeUndefined();
    expect(await first.loadActiveProject()).toEqual({ id: "first-project" });
    vi.stubGlobal("localStorage", undefined);
    expect(await first.loadActiveProject()).toEqual({ id: "first-project" });
    expect(await second.loadActiveProject()).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});
