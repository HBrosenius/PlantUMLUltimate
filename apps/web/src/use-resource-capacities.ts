import { useCallback, useEffect, useState } from "react";
import type { ResourceCapacity } from "./ResourceWorkloadPanel";

const STORAGE_KEY = "plantuml-studio.resource-capacities-by-document";

export function useResourceCapacities(
  documentId: string,
  initial: ResourceCapacity = {},
  memoryOnly = false,
  onChange?: (capacities: ResourceCapacity) => void,
) {
  const [byDocument, setByDocument] = useState<Record<string, ResourceCapacity>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    const persistable = memoryOnly
      ? Object.fromEntries(Object.entries(byDocument).filter(([id]) => id !== documentId))
      : byDocument;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [byDocument, documentId, memoryOnly]);
  const update = useCallback(
    (updater: (current: ResourceCapacity) => ResourceCapacity) => {
      setByDocument((all) => {
        const next = updater(all[documentId] ?? initial);
        onChange?.(next);
        return { ...all, [documentId]: next };
      });
    },
    [documentId, initial, onChange],
  );
  const rename = useCallback(
    (currentName: string, nextName: string) =>
      update((current) => {
        if (current[currentName] === undefined) return current;
        const next = { ...current, [nextName]: current[currentName] };
        delete next[currentName];
        return next;
      }),
    [update],
  );
  return { capacities: byDocument[documentId] ?? initial, updateCapacities: update, renameCapacity: rename };
}
