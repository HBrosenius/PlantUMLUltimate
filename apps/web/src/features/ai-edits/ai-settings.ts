import { withCredentialStore } from "../../credential-store";
import { savePreference } from "../../browser-preferences";
import { storageGet } from "../../safe-storage";
import { DEFAULT_AI_MODELS, isKnownAiModel, isValidModelId } from "./models";
import { AI_PROVIDER_IDS, DEFAULT_AI_PROVIDER, isAiProviderId, type AiProviderId } from "./providers";

/**
 * AI assistant settings and the API keys.
 *
 * Preferences (on/off, consent, provider, model, "remember") live in localStorage. A key is NOT a preference:
 * each provider's key is held in memory for the session and, only when the user opts in, in a dedicated
 * IndexedDB database that no document, backup, export, share link or collaboration code reads. Nothing outside
 * this file touches it.
 */
const PREFERENCE_KEY = "plantuml-studio.ai-assistant";
const KEY_DATABASE = "plantuml-studio-ai-assistant";
const KEY_STORE = "credentials";
/** The Anthropic record keeps its original name so keys remembered before other providers existed still load. */
const KEY_RECORDS: Record<AiProviderId, string> = {
  anthropic: "anthropic-api-key",
  openai: "openai-api-key",
  xai: "xai-api-key",
};

export interface AiAssistantState {
  enabled: boolean;
  /** The chosen provider. */
  provider: AiProviderId;
  /** ISO time the user accepted the consent screen for the chosen provider, or undefined. */
  consentedAt: string | undefined;
  /** The model of the chosen provider: one of the listed ids or a custom id. */
  model: string;
  /** Whether the chosen provider's key is also kept on this device (IndexedDB). */
  remember: boolean;
  /** Whether the chosen provider has a key. */
  hasKey: boolean;
}

interface StoredPreferences {
  enabled: boolean;
  provider: AiProviderId;
  /** Consent is per provider: agreeing to send text to one company is not agreeing to send it to another. */
  consents: Partial<Record<AiProviderId, string>>;
  models: Record<AiProviderId, string>;
  remember: Record<AiProviderId, boolean>;
}

const sessionKeys: Partial<Record<AiProviderId, string>> = {};
let preferences: StoredPreferences = readPreferences();
let snapshot = makeSnapshot();
const listeners = new Set<() => void>();

function defaultPreferences(): StoredPreferences {
  return {
    enabled: false,
    provider: DEFAULT_AI_PROVIDER,
    consents: {},
    models: { ...DEFAULT_AI_MODELS },
    remember: { anthropic: false, openai: false, xai: false },
  };
}

/**
 * Reads the stored preferences. The first version stored one Anthropic-only shape
 * (`consentedAt`, `model`, `remember: boolean`); it is migrated here into the per-provider shape.
 */
function readPreferences(): StoredPreferences {
  const result = defaultPreferences();
  try {
    const stored = storageGet(PREFERENCE_KEY);
    if (!stored) return result;
    const value = JSON.parse(stored) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return result;
    if (isAiProviderId(value.provider)) result.provider = value.provider;

    if (typeof value.consentedAt === "string") result.consents.anthropic = value.consentedAt;
    const consents = value.consents as Record<string, unknown> | null | undefined;
    for (const id of AI_PROVIDER_IDS) {
      const consent = consents?.[id];
      if (typeof consent === "string") result.consents[id] = consent;
    }

    if (isValidModelId(value.model)) result.models.anthropic = value.model;
    const models = value.models as Record<string, unknown> | null | undefined;
    for (const id of AI_PROVIDER_IDS) {
      const model = models?.[id];
      if (isValidModelId(model)) result.models[id] = model;
    }

    if (value.remember === true) result.remember.anthropic = true;
    const remember = value.remember as Record<string, unknown> | null | undefined;
    if (remember && typeof remember === "object") {
      for (const id of AI_PROVIDER_IDS) if (remember[id] === true) result.remember[id] = true;
    }

    // Without a recorded consent for the chosen provider the feature stays off, whatever else is stored.
    result.enabled = value.enabled === true && result.consents[result.provider] !== undefined;
    return result;
  } catch {
    return defaultPreferences();
  }
}

function makeSnapshot(): AiAssistantState {
  const provider = preferences.provider;
  return {
    enabled: preferences.enabled,
    provider,
    consentedAt: preferences.consents[provider],
    model: preferences.models[provider],
    remember: preferences.remember[provider],
    hasKey: sessionKeys[provider] !== undefined,
  };
}

function publish() {
  snapshot = makeSnapshot();
  for (const listener of listeners) listener();
}

function persistPreferences() {
  savePreference(PREFERENCE_KEY, JSON.stringify({ version: 2, ...preferences }));
}

export function subscribeAiAssistant(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getAiAssistantState = (): AiAssistantState => snapshot;

/**
 * A provider's key (default: the chosen provider's), or undefined. Read only at the moment a request is
 * sent; never stored in React state.
 */
export const getAiKey = (provider: AiProviderId = preferences.provider): string | undefined => sessionKeys[provider];

/** True when the user has consented to the chosen provider, turned the assistant on and provided its key. */
export function isAiAssistantReady(state: AiAssistantState = snapshot): boolean {
  return state.enabled && state.consentedAt !== undefined && state.hasKey;
}

/** Records consent for the chosen provider and turns the assistant on. */
export function enableAiAssistant(): void {
  const provider = preferences.provider;
  preferences = {
    ...preferences,
    enabled: true,
    consents: { ...preferences.consents, [provider]: preferences.consents[provider] ?? new Date().toISOString() },
  };
  persistPreferences();
  publish();
}

export function disableAiAssistant(): void {
  preferences = { ...preferences, enabled: false };
  persistPreferences();
  publish();
}

export function setAiProvider(provider: AiProviderId): void {
  if (!isAiProviderId(provider) || provider === preferences.provider) return;
  preferences = { ...preferences, provider };
  persistPreferences();
  publish();
}

/** Sets the model of the chosen provider: a listed model or a valid custom id. */
export function setAiModel(model: string): void {
  if (!isKnownAiModel(model, preferences.provider) && !isValidModelId(model)) return;
  preferences = { ...preferences, models: { ...preferences.models, [preferences.provider]: model } };
  persistPreferences();
  publish();
}

function withKeyStore<T>(
  action: (store: IDBObjectStore) => IDBRequest<T>,
  mode: IDBTransactionMode,
): Promise<T | undefined> {
  return withCredentialStore(KEY_DATABASE, KEY_STORE, action, mode);
}

/**
 * Stores a provider's key for this session and, when `remember` is true, on this device. Resolves to false
 * when the device store could not be written; the key is still usable for the session.
 */
export async function saveAiKey(
  key: string,
  remember: boolean,
  provider: AiProviderId = preferences.provider,
): Promise<boolean> {
  const trimmed = key.trim();
  if (!trimmed) return false;
  sessionKeys[provider] = trimmed;
  preferences = { ...preferences, remember: { ...preferences.remember, [provider]: remember } };
  persistPreferences();
  let stored = true;
  if (remember) {
    stored = (await withKeyStore((store) => store.put(trimmed, KEY_RECORDS[provider]), "readwrite")) !== undefined;
    if (!stored) {
      // IndexedDB blocked or full: fall back to session-only and say so.
      preferences = { ...preferences, remember: { ...preferences.remember, [provider]: false } };
      persistPreferences();
    }
  } else {
    await withKeyStore((store) => store.delete(KEY_RECORDS[provider]), "readwrite");
  }
  publish();
  return stored;
}

/** Removes a provider's key (default: the chosen provider's) from memory and from this device. */
export async function forgetAiKey(provider: AiProviderId = preferences.provider): Promise<void> {
  delete sessionKeys[provider];
  preferences = { ...preferences, remember: { ...preferences.remember, [provider]: false } };
  persistPreferences();
  publish();
  await withKeyStore((store) => store.delete(KEY_RECORDS[provider]), "readwrite");
}

/** Loads every remembered key into memory. Call once at start-up. */
export async function loadRememberedAiKey(): Promise<void> {
  for (const provider of AI_PROVIDER_IDS) {
    if (!preferences.remember[provider] || sessionKeys[provider]) continue;
    const stored = await withKeyStore((store) => store.get(KEY_RECORDS[provider]), "readonly");
    if (typeof stored === "string" && stored && !sessionKeys[provider]) {
      sessionKeys[provider] = stored;
      publish();
    }
  }
}

/** Test hook: resets module state as if the page had just loaded. */
export function resetAiAssistantForTests(): void {
  for (const provider of AI_PROVIDER_IDS) delete sessionKeys[provider];
  preferences = readPreferences();
  publish();
}
