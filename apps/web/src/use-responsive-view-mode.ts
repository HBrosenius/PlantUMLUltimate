import { useCallback, useEffect, useState } from "react";
import type { ViewMode } from "./model";

const query = "(max-width: 600px)";

/** A phone pane choice is temporary; the persisted desktop preference stays intact. */
export function useResponsiveViewMode(preferred: ViewMode, persist: (mode: ViewMode) => void) {
  const [narrow, setNarrow] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  const [phoneMode, setPhoneMode] = useState<"code" | "diagram">();
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const change = () => {
      setNarrow(media.matches);
      if (!media.matches) setPhoneMode(undefined);
    };
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const selectViewMode = useCallback(
    (mode: ViewMode) => {
      if (narrow) setPhoneMode(mode === "split" ? "code" : mode);
      else persist(mode);
    },
    [narrow, persist],
  );
  return {
    narrow,
    viewMode: narrow ? (phoneMode ?? (preferred === "split" ? "diagram" : preferred)) : preferred,
    selectViewMode,
  };
}
