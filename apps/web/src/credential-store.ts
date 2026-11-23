/**
 * Runs one request against a dedicated IndexedDB database that holds remembered credentials (API keys, tokens).
 * Each feature keeps its own database; no document, backup, export, share link or collaboration code reads them.
 * Resolves to undefined when IndexedDB is unavailable, blocked or full, so callers fall back to session-only.
 */
export function withCredentialStore<T>(
  database: string,
  storeName: string,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(database, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(storeName);
      open.onerror = open.onblocked = () => resolve(undefined);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const transaction = db.transaction(storeName, mode);
          const request = action(transaction.objectStore(storeName));
          let result: T | undefined;
          request.onsuccess = () => {
            result = request.result;
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(result);
          };
          transaction.onerror = transaction.onabort = () => {
            db.close();
            resolve(undefined);
          };
        } catch {
          db.close();
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}
