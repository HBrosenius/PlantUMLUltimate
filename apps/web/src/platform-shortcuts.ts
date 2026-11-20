export function isApplePlatform(platform?: string): boolean {
  const value = platform ?? (typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent);
  return /Mac|iPhone|iPad|iPod/i.test(value);
}

export function optionShortcut(key: string, apple = isApplePlatform()): string {
  return apple ? `⌥${key.toUpperCase()}` : `Alt+${key.toUpperCase()}`;
}

/** Command/Control shortcut label: `⇧⌘Z` on Apple platforms, `Ctrl+Shift+Z` elsewhere. */
export function modShortcut(key: string, shift = false, apple = isApplePlatform()): string {
  const label = key.toUpperCase();
  return apple ? `${shift ? "⇧" : ""}⌘${label}` : `Ctrl+${shift ? "Shift+" : ""}${label}`;
}
