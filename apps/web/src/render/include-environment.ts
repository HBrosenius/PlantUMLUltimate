import type { IncludeContext } from "./includes";

/**
 * How the renderer finds out where a diagram's includes can come from. The app registers one environment:
 * given the id of an open document tab, it answers with the other diagrams of the same `.pumlu` document
 * and, for a file opened from a Git host or a folder, a reader for the files beside it. Documents the
 * environment doesn't know (previews that aren't open tabs) simply have no context, so only the bundled
 * library and themes expand for them.
 */
export interface IncludeEnvironment {
  contextFor(documentId: string): IncludeContext | undefined;
}

let environment: IncludeEnvironment | undefined;

export function setIncludeEnvironment(next: IncludeEnvironment | undefined): void {
  environment = next;
}

let environmentVersion = 0;
const environmentListeners = new Set<() => void>();

/** The app calls this when what an include can read changed (tabs opened or closed, a project loaded). */
export function notifyIncludeEnvironment(): void {
  environmentVersion += 1;
  for (const listener of [...environmentListeners]) listener();
}
export function subscribeIncludeEnvironment(listener: () => void): () => void {
  environmentListeners.add(listener);
  return () => environmentListeners.delete(listener);
}
export const includeEnvironmentVersion = () => environmentVersion;

export function includeContextFor(documentId: string): IncludeContext | undefined {
  return environment?.contextFor(documentId);
}

/** A fast, non-cryptographic hash of a string, for cache keys and change detection. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${text.length.toString(36)}-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

/**
 * Changes whenever something an include in `context` could read changes in the open document (another
 * diagram's text, or which file the diagram came from). Text read from a repository or folder is tracked by
 * the include cache instead.
 */
export function includeContextSignature(context: IncludeContext | undefined): string {
  if (!context) return "";
  const documents = (context.documents ?? []).map((item) => `${item.name}:${hashText(item.source)}`).join("|");
  const files = context.files ? `${context.files.scope}:${context.files.version ?? ""}:${context.files.path}` : "";
  return `${context.name ?? ""}\u0000${documents}\u0000${files}`;
}
