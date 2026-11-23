import { savePreference } from "../../browser-preferences";
import { withCredentialStore } from "../../credential-store";
import { storageGet } from "../../safe-storage";

/**
 * The GitHub token.
 *
 * Mirrors the AI assistant's key handling: the token is held in memory for the session and, only when the user
 * opts in, in a dedicated IndexedDB database that no document, backup, export, snapshot, share link or
 * collaboration code reads. Only the "remember" choice is a preference (localStorage); the token itself is
 * never written there. Nothing outside features/github calls `getGitHubToken`, and nothing logs it.
 */
const PREFERENCE_KEY = "plantuml-studio.github";
const TOKEN_DATABASE = "plantuml-studio-github";
const TOKEN_STORE = "credentials";
const TOKEN_RECORD = "github-token";

export interface GitHubState {
  /** Whether the token is also kept on this device (IndexedDB). */
  remember: boolean;
  hasToken: boolean;
}

let sessionToken: string | undefined;
let remember = readRemember();
let snapshot = makeSnapshot();
const listeners = new Set<() => void>();

function readRemember(): boolean {
  try {
    const stored = storageGet(PREFERENCE_KEY);
    return stored ? (JSON.parse(stored) as { remember?: unknown } | null)?.remember === true : false;
  } catch {
    return false;
  }
}

function makeSnapshot(): GitHubState {
  return { remember, hasToken: sessionToken !== undefined };
}

function publish() {
  snapshot = makeSnapshot();
  for (const listener of listeners) listener();
}

function persistPreference() {
  savePreference(PREFERENCE_KEY, JSON.stringify({ version: 1, remember }));
}

const tokenStore = <T>(action: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) =>
  withCredentialStore(TOKEN_DATABASE, TOKEN_STORE, action, mode);

export function subscribeGitHub(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getGitHubState = (): GitHubState => snapshot;

/** The token, or undefined. Read only at the moment a request is sent; never stored in React state. */
export const getGitHubToken = (): string | undefined => sessionToken;

/**
 * Stores the token for this session and, when `rememberOnDevice` is true, on this device. Resolves to false
 * when the device store could not be written; the token is still usable for the session.
 */
export async function saveGitHubToken(token: string, rememberOnDevice: boolean): Promise<boolean> {
  const trimmed = token.trim();
  if (!trimmed) return false;
  sessionToken = trimmed;
  remember = rememberOnDevice;
  persistPreference();
  let stored = true;
  if (rememberOnDevice) {
    stored = (await tokenStore((store) => store.put(trimmed, TOKEN_RECORD), "readwrite")) !== undefined;
    if (!stored) {
      // IndexedDB blocked or full: fall back to session-only and say so.
      remember = false;
      persistPreference();
    }
  } else {
    await tokenStore((store) => store.delete(TOKEN_RECORD), "readwrite");
  }
  publish();
  return stored;
}

/** Removes the token from memory and from this device. */
export async function forgetGitHubToken(): Promise<void> {
  sessionToken = undefined;
  remember = false;
  persistPreference();
  publish();
  await tokenStore((store) => store.delete(TOKEN_RECORD), "readwrite");
}

/** Loads a remembered token into memory. Call when something needs the token. */
export async function loadRememberedGitHubToken(): Promise<void> {
  if (!remember || sessionToken) return;
  const stored = await tokenStore((store) => store.get(TOKEN_RECORD), "readonly");
  if (typeof stored === "string" && stored && !sessionToken) {
    sessionToken = stored;
    publish();
  }
}

/** Test hook: resets module state as if the page had just loaded. */
export function resetGitHubForTests(): void {
  sessionToken = undefined;
  remember = readRemember();
  publish();
}
