export function isApplePlatform(platform?: string): boolean {
  const value = platform ?? (typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent);
  return /Mac|iPhone|iPad|iPod/i.test(value);
}

export function optionShortcut(key: string, apple = isApplePlatform()): string {
  return apple ? `⌥${key.toUpperCase()}` : `Alt+${key.toUpperCase()}`;
}
