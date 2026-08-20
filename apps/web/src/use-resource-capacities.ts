import { useCallback, useEffect, useState } from "react";
import type { ResourceCapacity } from "./ResourceWorkloadPanel";

const STORAGE_KEY = "plantuml-studio.resource-capacities-by-document";

export function useResourceCapacities(documentId: string) {
  const [byDocument, setByDocument] = useState<Record<string, ResourceCapacity>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(byDocument));
  }, [byDocument]);
  const update = useCallback(
    (updater: (current: ResourceCapacity) => ResourceCapacity) => {
      setByDocument((all) => ({ ...all, [documentId]: updater(all[documentId] ?? {}) }));
    },
    [documentId],
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
  return { capacities: byDocument[documentId] ?? {}, updateCapacities: update, renameCapacity: rename };
}
