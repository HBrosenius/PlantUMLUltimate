/**
 * Stores a small browser preference. Preferences are conveniences, so a full or blocked
 * localStorage must never interrupt editing; the write is skipped and false is returned.
 */
export function savePreference(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
