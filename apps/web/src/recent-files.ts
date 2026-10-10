import { savePreference } from "./browser-preferences";
import { storageGet } from "./safe-storage";
import type { WritableFileHandle } from "./file-service";
export type OpenDestination = "diagram" | "document";
export interface RecentFile {
  id: string;
  fileName: string;
  openedAt: string;
  destination: OpenDestination;
  handle?: WritableFileHandle | undefined;
}
const key = "plantuml-studio.recent-files";
const handles = new Map<string, WritableFileHandle>();
let sessionEntries: RecentFile[] | undefined;
let writes = Promise.resolve();
function serialize(operation: () => Promise<void>) {
  const result = writes.then(operation);
  writes = result.catch(() => undefined);
  return result;
}
async function handleStore<T>(action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    return await new Promise((resolve) => {
      const request = indexedDB.open("plantuml-studio-file-references", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onerror = () => resolve(undefined);
      request.onblocked = () => resolve(undefined);
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction("handles", "readwrite");
          const operation = action(tx.objectStore("handles"));
          let result: T | undefined;
          operation.onsuccess = () => {
            result = operation.result;
          };
          tx.oncomplete = () => {
            db.close();
            resolve(result);
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            resolve(undefined);
          };
        } catch {
          db.close();
          resolve(undefined);
        }
      };
    });
  } catch {
    return undefined;
  }
}
function metadata(): RecentFile[] {
  try {
    const stored = storageGet(key);
    if (!stored) return sessionEntries ?? [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return sessionEntries ?? [];
    return parsed
      .filter(
        (entry): entry is RecentFile =>
          entry &&
          typeof entry.id === "string" &&
          typeof entry.fileName === "string" &&
          typeof entry.openedAt === "string" &&
          ["diagram", "document"].includes(entry.destination),
      )
      .slice(0, 12);
  } catch {
    return sessionEntries ?? [];
  }
}
async function readEntries(): Promise<RecentFile[]> {
  const entries = metadata();
  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      handle: handles.get(entry.id) ?? (await handleStore((store) => store.get(entry.id))),
    })),
  );
}
async function remember(fileName: string, handle: WritableFileHandle | undefined, destination: OpenDestination) {
  const entries = await readEntries();
  let previous = entries.find(
    (entry) => !handle && !entry.handle && entry.fileName === fileName && entry.destination === destination,
  );
  if (handle?.isSameEntry) {
    for (const entry of entries) {
      if (
        entry.destination === destination &&
        entry.handle &&
        (await handle.isSameEntry(entry.handle).catch(() => false))
      ) {
        previous = entry;
        break;
      }
    }
  }
  const id = previous?.id ?? crypto.randomUUID();
  if (handle) {
    handles.set(id, handle);
    await handleStore((store) => store.put(handle, id));
  }
  sessionEntries = [
    { id, fileName, openedAt: new Date().toISOString(), destination },
    ...entries.filter((entry) => entry.id !== id),
  ].slice(0, 12);
  for (const entry of entries)
    if (!sessionEntries.some((item) => item.id === entry.id)) {
      handles.delete(entry.id);
      await handleStore((store) => store.delete(entry.id));
    }
  savePreference(
    key,
    JSON.stringify(
      sessionEntries.map(({ id: entryId, fileName: name, openedAt, destination: target }) => ({
        id: entryId,
        fileName: name,
        openedAt,
        destination: target,
      })),
    ),
  );
}
async function remove(id: string) {
  sessionEntries = (await readEntries())
    .filter((entry) => entry.id !== id)
    .map(({ id: entryId, fileName, openedAt, destination }) => ({ id: entryId, fileName, openedAt, destination }));
  handles.delete(id);
  await handleStore((store) => store.delete(id));
  savePreference(key, JSON.stringify(sessionEntries));
}
export async function loadRecentFiles() {
  await writes;
  return readEntries();
}
export function rememberRecentFile(
  fileName: string,
  handle: WritableFileHandle | undefined,
  destination: OpenDestination,
) {
  return serialize(() => remember(fileName, handle, destination));
}
export function removeRecentFile(id: string) {
  return serialize(() => remove(id));
}
export async function readRecentHandle(entry: RecentFile): Promise<WritableFileHandle> {
  const handle = entry.handle;
  if (!handle)
    throw new Error("This browser needs you to locate the file again. Your recovered diagrams are unchanged.");
  const permission = await handle.queryPermission?.({ mode: "read" });
  if (permission && permission !== "granted" && (await handle.requestPermission?.({ mode: "read" })) !== "granted") {
    throw new Error("File access was denied. Choose Locate file… to grant access again.");
  }
  return handle;
}
