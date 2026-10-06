import { useCallback, useEffect, useRef, useState } from "react";

export type ProjectLeaveChoice = "save" | "discard" | "cancel";

export function useUnsavedProjectGuard(options: {
  dirty: boolean;
  projectId?: string | undefined;
  projectName?: string | undefined;
  save(): Promise<boolean>;
}) {
  const latest = useRef(options);
  latest.current = options;
  const [request, setRequest] = useState<{ projectName: string; action: string }>();
  const resolver = useRef<((choice: ProjectLeaveChoice) => void) | undefined>(undefined);
  const pending = useRef(false);
  const decide = useCallback((choice: ProjectLeaveChoice) => {
    const resolve = resolver.current;
    resolver.current = undefined;
    setRequest(undefined);
    resolve?.(choice);
  }, []);

  useEffect(() => {
    if (!options.dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [options.dirty]);

  useEffect(() => () => resolver.current?.("cancel"), []);

  const confirmLeave = useCallback(async (action: string) => {
    if (pending.current) return false;
    if (!latest.current.dirty) return true;
    pending.current = true;
    const projectId = latest.current.projectId;
    try {
      const choice = await new Promise<ProjectLeaveChoice>((resolve) => {
        resolver.current = resolve;
        setRequest({ projectName: latest.current.projectName ?? "Document", action });
      });
      if (latest.current.projectId !== projectId || choice === "cancel") return false;
      if (choice === "discard") return true;
      const saved = await latest.current.save();
      return saved && latest.current.projectId === projectId;
    } finally {
      pending.current = false;
    }
  }, []);

  return { request, decide, confirmLeave };
}
