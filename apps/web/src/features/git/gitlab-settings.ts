import { savePreference } from "../../browser-preferences";
import { withCredentialStore } from "../../credential-store";
import { storageGet } from "../../safe-storage";
import { normalizeServer } from "./git-origin";

/**
 * GitLab tokens, one per server.
 *
 * Same rules as the GitHub token: held in memory for the session and, only when the user opts in for that
 * server, in a dedicated IndexedDB database that no document, backup, export, snapshot, share link or
 * collaboration code reads. The preference (localStorage) holds only the last used server address and which
 * servers are remembered, never a token. A token is stored under its server and is only handed out for that
 * server, so it can only ever be sent to that server's API. Nothing logs it.
 */
const PREFERENCE_KEY = "plantuml-studio.gitlab";
const TOKEN_DATABASE = "plantuml-studio-gitlab";
const TOKEN_STORE = "credentials";

export const DEFAULT_GITLAB_SERVER = "https://gitlab.com";

export interface GitLabState {
  /** The server address last used in Settings. */
  server: string;
  /** Servers that have a token in memory. */
  servers: string[];
  /** Servers whose token is also kept on this device. */
  remembered: string[];
}

const recordKey = (server: string) => `token:${server}`;

interface Preference {
  server: string;
  remembered: string[];
}

function readPreference(): Preference {
  const fallback: Preference = { server: DEFAULT_GITLAB_SERVER, remembered: [] };
  try {
    const stored = storageGet(PREFERENCE_KEY);
    const parsed = stored ? (JSON.parse(stored) as { server?: unknown; remembered?: unknown } | null) : null;
    if (!parsed) return fallback;
    const server = typeof parsed.server === "string" ? normalizeServer(parsed.server) : undefined;
    const remembered = Array.isArray(parsed.remembered)
      ? [
          ...new Set(
            parsed.remembered.flatMap((item) => {
              const normalized = typeof item === "string" ? normalizeServer(item) : undefined;
              return normalized ? [normalized] : [];
            }),
          ),
        ]
      : [];
    return { server: server ?? DEFAULT_GITLAB_SERVER, remembered };
  } catch {
    return fallback;
  }
}

const sessionTokens = new Map<string, string>();
let preference = readPreference();
let snapshot = makeSnapshot();
const listeners = new Set<() => void>();

function makeSnapshot(): GitLabState {
  return { server: preference.server, servers: [...sessionTokens.keys()].sort(), remembered: preference.remembered };
}

function publish() {
  snapshot = makeSnapshot();
  for (const listener of listeners) listener();
}

function persistPreference() {
  savePreference(PREFERENCE_KEY, JSON.stringify({ version: 1, ...preference }));
}

const tokenStore = <T>(action: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) =>
  withCredentialStore(TOKEN_DATABASE, TOKEN_STORE, action, mode);

export function subscribeGitLab(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getGitLabState = (): GitLabState => snapshot;

export const gitLabHasToken = (server: string): boolean => sessionTokens.has(server);
export const gitLabRemembers = (server: string): boolean => preference.remembered.includes(server);

/** The token for exactly this server, or undefined. Read only when a request is sent; never stored in React state. */
export const getGitLabToken = (server: string): string | undefined => sessionTokens.get(server);

/** Remembers the server address Settings should show next time. */
export function setGitLabServer(server: string): void {
  const normalized = normalizeServer(server);
  if (!normalized || normalized === preference.server) return;
  preference = { ...preference, server: normalized };
  persistPreference();
  publish();
}

/**
 * Stores the token for this session and, when `rememberOnDevice` is true, on this device, under `server`.
 * Resolves to false when the device store could not be written (the token is still usable for the session) or
 * when the server address is not a valid https address.
 */
export async function saveGitLabToken(server: string, token: string, rememberOnDevice: boolean): Promise<boolean> {
  const normalized = normalizeServer(server);
  const trimmed = token.trim();
  if (!normalized || !trimmed) return false;
  sessionTokens.set(normalized, trimmed);
  let stored = true;
  if (rememberOnDevice) {
    stored = (await tokenStore((store) => store.put(trimmed, recordKey(normalized)), "readwrite")) !== undefined;
  } else {
    await tokenStore((store) => store.delete(recordKey(normalized)), "readwrite");
  }
  const remembered = preference.remembered.filter((item) => item !== normalized);
  if (rememberOnDevice && stored) remembered.push(normalized);
  preference = { server: normalized, remembered };
  persistPreference();
  publish();
  return stored;
}

/** Removes the token for this server from memory and from this device. */
export async function forgetGitLabToken(server: string): Promise<void> {
  const normalized = normalizeServer(server);
  if (!normalized) return;
  sessionTokens.delete(normalized);
  preference = { ...preference, remembered: preference.remembered.filter((item) => item !== normalized) };
  persistPreference();
  publish();
  await tokenStore((store) => store.delete(recordKey(normalized)), "readwrite");
}

/** Loads the remembered tokens into memory. Call when something needs a token (and once at startup). */
export async function loadRememberedGitLabTokens(): Promise<void> {
  const pending = preference.remembered.filter((server) => !sessionTokens.has(server));
  if (!pending.length) return;
  let changed = false;
  for (const server of pending) {
    const stored = await tokenStore((store) => store.get(recordKey(server)), "readonly");
    // Not overwritten when a token was saved meanwhile, and dropped if it was forgotten while loading.
    if (typeof stored === "string" && stored && !sessionTokens.has(server) && gitLabRemembers(server)) {
      sessionTokens.set(server, stored);
      changed = true;
    }
  }
  if (changed) publish();
}

/** Test hook: resets module state as if the page had just loaded. */
export function resetGitLabForTests(): void {
  sessionTokens.clear();
  preference = readPreference();
  publish();
}
