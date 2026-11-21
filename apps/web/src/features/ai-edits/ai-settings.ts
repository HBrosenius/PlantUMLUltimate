import { savePreference } from "../../browser-preferences";
import { storageGet } from "../../safe-storage";
import { DEFAULT_AI_MODEL, isKnownAiModel } from "./models";

/**
 * AI assistant settings and the API key.
 *
 * Preferences (on/off, consent, model, "remember") live in localStorage. The key is NOT a preference: it is
 * held in memory for the session and, only when the user opts in, in a dedicated IndexedDB database that no
 * document, backup, export, share link or collaboration code reads. Nothing outside this file touches it.
 */
const PREFERENCE_KEY = "plantuml-studio.ai-assistant";
const KEY_DATABASE = "plantuml-studio-ai-assistant";
const KEY_STORE = "credentials";
const KEY_RECORD = "anthropic-api-key";

export interface AiAssistantState {
  enabled: boolean;
  /** ISO time the user accepted the consent screen, or undefined. */
  consentedAt: string | undefined;
  model: string;
  /** Whether the key is also kept on this device (IndexedDB). */
  remember: boolean;
  hasKey: boolean;
}

interface StoredPreferences {
  enabled: boolean;
  consentedAt?: string;
  model: string;
  remember: boolean;
}

let sessionKey: string | undefined;
let preferences: StoredPreferences = readPreferences();
let snapshot = makeSnapshot();
const listeners = new Set<() => void>();

function readPreferences(): StoredPreferences {
  const fallback: StoredPreferences = { enabled: false, model: DEFAULT_AI_MODEL, remember: false };
  try {
    const stored = storageGet(PREFERENCE_KEY);
    if (!stored) return fallback;
    const value = JSON.parse(stored) as Partial<StoredPreferences> | null;
    if (!value || typeof value !== "object") return fallback;
    const consentedAt = typeof value.consentedAt === "string" ? value.consentedAt : undefined;
    return {
      // Without a recorded consent the feature stays off, whatever else is stored.
      enabled: value.enabled === true && consentedAt !== undefined,
      ...(consentedAt ? { consentedAt } : {}),
      model: isKnownAiModel(value.model) ? value.model : DEFAULT_AI_MODEL,
      remember: value.remember === true,
    };
  } catch {
    return fallback;
  }
}

function makeSnapshot(): AiAssistantState {
  return {
    enabled: preferences.enabled,
    consentedAt: preferences.consentedAt,
    model: preferences.model,
    remember: preferences.remember,
    hasKey: sessionKey !== undefined,
  };
}

function publish() {
  snapshot = makeSnapshot();
  for (const listener of listeners) listener();
}

function persistPreferences() {
  savePreference(PREFERENCE_KEY, JSON.stringify(preferences));
}

export function subscribeAiAssistant(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getAiAssistantState = (): AiAssistantState => snapshot;

/** The key, or undefined. Read only at the moment a request is sent; never stored in React state. */
export const getAiKey = (): string | undefined => sessionKey;

/** True when the user has consented, turned the assistant on and provided a key. */
export function isAiAssistantReady(state: AiAssistantState = snapshot): boolean {
  return state.enabled && state.consentedAt !== undefined && state.hasKey;
}

export function enableAiAssistant(): void {
  preferences = { ...preferences, enabled: true, consentedAt: preferences.consentedAt ?? new Date().toISOString() };
  persistPreferences();
  publish();
}

export function disableAiAssistant(): void {
  preferences = { ...preferences, enabled: false };
  persistPreferences();
  publish();
}

export function setAiModel(model: string): void {
  if (!isKnownAiModel(model)) return;
  preferences = { ...preferences, model };
  persistPreferences();
  publish();
}

function withKeyStore<T>(
  action: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(KEY_DATABASE, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(KEY_STORE);
      open.onerror = open.onblocked = () => resolve(undefined);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const transaction = db.transaction(KEY_STORE, mode);
          const request = action(transaction.objectStore(KEY_STORE));
          let result: T | undefined;
          request.onsuccess = () => {
            result = request.result;
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(result);
          };
          transaction.onerror = transaction.onabort = () => {
            db.close();
            resolve(undefined);
          };
        } catch {
          db.close();
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Stores the key for this session and, when `remember` is true, on this device. Resolves to false when the
 * device store could not be written; the key is still usable for the session.
 */
export async function saveAiKey(key: string, remember: boolean): Promise<boolean> {
  const trimmed = key.trim();
  if (!trimmed) return false;
  sessionKey = trimmed;
  preferences = { ...preferences, remember };
  persistPreferences();
  let stored = true;
  if (remember) {
    stored = (await withKeyStore((store) => store.put(trimmed, KEY_RECORD), "readwrite")) !== undefined;
    if (!stored) {
      // IndexedDB blocked or full: fall back to session-only and say so.
      preferences = { ...preferences, remember: false };
      persistPreferences();
    }
  } else {
    await withKeyStore((store) => store.delete(KEY_RECORD), "readwrite");
  }
  publish();
  return stored;
}

/** Removes the key from memory and from this device. */
export async function forgetAiKey(): Promise<void> {
  sessionKey = undefined;
  preferences = { ...preferences, remember: false };
  persistPreferences();
  publish();
  await withKeyStore((store) => store.delete(KEY_RECORD), "readwrite");
}

/** Loads a remembered key into memory. Call once at start-up. */
export async function loadRememberedAiKey(): Promise<void> {
  if (!preferences.remember || sessionKey) return;
  const stored = await withKeyStore((store) => store.get(KEY_RECORD), "readonly");
  if (typeof stored === "string" && stored && !sessionKey) {
    sessionKey = stored;
    publish();
  }
}

/** Test hook: resets module state as if the page had just loaded. */
export function resetAiAssistantForTests(): void {
  sessionKey = undefined;
  preferences = readPreferences();
  publish();
}
