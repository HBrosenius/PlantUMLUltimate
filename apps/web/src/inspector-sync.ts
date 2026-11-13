/**
 * Brings an inspector's local form state up to date with new source-derived values without
 * discarding edits in progress. Only fields whose source value changed since the last sync are
 * replaced; a field the user is still typing into keeps its local value until it is committed.
 *
 * Without this, a commit on one field (which re-parses the source and hands the inspector new
 * props shortly afterwards) wipes whatever was just typed into the next field.
 */
export function mergeChangedFields<T extends object>(local: T, previous: T, next: T): T {
  let merged: T | undefined;
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (Object.is(previous[key], next[key]) || Object.is(local[key], next[key])) continue;
    merged ??= { ...local };
    merged[key] = next[key];
  }
  return merged ?? local;
}
