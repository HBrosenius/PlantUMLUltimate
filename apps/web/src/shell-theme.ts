import { storageRemove, storageSet } from "./safe-storage";
import type { Theme } from "./model";

/** Mirror of the workspace theme that index.html applies before the application mounts. */
export const SHELL_THEME_KEY = "plantuml-studio.theme";

const SHELL_BACKGROUND = { light: "#f7f8fa", dark: "#111318" } as const;

/** Keep the document root, browser chrome colour and the pre-paint mirror in step with the workspace theme. */
export function applyShellTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    storageRemove(SHELL_THEME_KEY);
  } else {
    root.dataset.theme = theme;
    storageSet(SHELL_THEME_KEY, theme);
  }
  // index.html declares one theme-color per colour scheme; an explicit theme overrides both.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = SHELL_BACKGROUND[theme === "system" ? scheme : theme];
  }
}
