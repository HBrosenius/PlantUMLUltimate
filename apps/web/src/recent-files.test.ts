// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import type { WritableFileHandle } from "./file-service";
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});
it("persists only recent references, caps them, and keeps fallback entries reopenable by locating a file", async () => {
  const recent = await import("./recent-files");
  for (let index = 0; index < 14; index++) await recent.rememberRecentFile(`file-${index}.puml`, undefined, "diagram");
  const files = await recent.loadRecentFiles();
  expect(files).toHaveLength(12);
  expect(files[0]!.fileName).toBe("file-13.puml");
  await expect(recent.readRecentHandle(files[0]!)).rejects.toThrow(/locate the file/);
  await recent.rememberRecentFile("file-4.puml", undefined, "diagram");
  expect((await recent.loadRecentFiles())[0]!.fileName).toBe("file-4.puml");
  await recent.removeRecentFile(files[0]!.id);
  vi.resetModules();
  const reloaded = await import("./recent-files");
  expect(await reloaded.loadRecentFiles()).toHaveLength(11);
  expect(localStorage.getItem("plantuml-studio.recent-files")).not.toContain("source");
});
it("requests read permission only for explicit reopening and reports denial", async () => {
  const recent = await import("./recent-files");
  const handle = {
    queryPermission: vi.fn(async () => "prompt"),
    requestPermission: vi.fn(async () => "denied"),
  } as unknown as WritableFileHandle;
  const entry = {
    id: "handle",
    fileName: "private.puml",
    openedAt: new Date().toISOString(),
    destination: "diagram" as const,
    handle,
  };
  await expect(recent.readRecentHandle(entry)).rejects.toThrow(/denied/);
  expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "read" });
  vi.mocked(handle.requestPermission!).mockResolvedValue("granted");
  await expect(recent.readRecentHandle(entry)).resolves.toBe(handle);
});

it("keeps concurrent file opens in the recent list", async () => {
  const recent = await import("./recent-files");
  await Promise.all(
    ["a.puml", "b.puml", "c.puml"].map((name) => recent.rememberRecentFile(name, undefined, "diagram")),
  );
  expect((await recent.loadRecentFiles()).map((entry) => entry.fileName)).toEqual(["c.puml", "b.puml", "a.puml"]);
});
