import { useSyncExternalStore } from "react";
import type { Theme } from "../model";
import type { StageRecolorTokens } from "../render/stage-recolor";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(listener: () => void) {
  const media = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : undefined;
  media?.addEventListener("change", listener);
  return () => media?.removeEventListener("change", listener);
}

/** True when the shell is (or, for "system", currently resolves to) the dark theme. */
export function useResolvedDark(theme: Theme): boolean {
  const systemDark = useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  return theme === "dark" || (theme === "system" && systemDark);
}

/** Dark-theme surface and foreground tokens, read from the app's CSS custom properties. */
export function readStageTokens(app: Element | null | undefined): StageRecolorTokens {
  const style = app ? getComputedStyle(app) : undefined;
  return {
    surface: style?.getPropertyValue("--panel").trim() || "#191c23",
    ink: style?.getPropertyValue("--text").trim() || "#e7eaf0",
  };
}
