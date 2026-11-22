import { useEffect, useState, useSyncExternalStore } from "react";
import {
  disableAiAssistant,
  enableAiAssistant,
  forgetAiKey,
  getAiAssistantState,
  loadRememberedAiKey,
  saveAiKey,
  setAiModel,
  setAiProvider,
  subscribeAiAssistant,
  type AiAssistantState,
} from "./ai-settings";
import { findAiModel, isKnownAiModel, isValidModelId, modelsFor } from "./models";
import { AI_PROVIDER_IDS, AI_PROVIDERS, isAiProviderId, type AiProviderInfo } from "./providers";

/** The Anthropic console, kept as a named export for callers that predate the other providers. */
export const CONSOLE_URL = AI_PROVIDERS.anthropic.consoleUrl;

const CUSTOM_MODEL = "__custom__";

/**
 * Settings > AI assistant. Unlike the other settings pages its controls act immediately (they are not part of
 * the dialog's Apply), because the key must be forgettable at once and consent is a deliberate step.
 */
export function AiAssistantSettings() {
  const state = useSyncExternalStore(subscribeAiAssistant, getAiAssistantState);
  const info = AI_PROVIDERS[state.provider];

  useEffect(() => {
    void loadRememberedAiKey();
  }, []);

  const consented = state.consentedAt !== undefined;

  return (
    <>
      <h3 id="settings-ai-heading">AI assistant</h3>
      <label>
        Provider
        <select
          value={state.provider}
          onChange={(event) => {
            if (isAiProviderId(event.target.value)) setAiProvider(event.target.value);
          }}
        >
          {AI_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {AI_PROVIDERS[id].label}
            </option>
          ))}
        </select>
      </label>
      {!state.enabled || !consented ? (
        <Consent info={info} state={state} />
      ) : (
        <ProviderControls key={state.provider} info={info} state={state} />
      )}
    </>
  );
}

function Consent({ info, state }: { info: AiProviderInfo; state: AiAssistantState }) {
  const consented = state.consentedAt !== undefined;
  return (
    <div className="ai-consent" role="group" aria-label="Turn on the AI assistant">
      <p>
        The AI assistant can propose changes to a diagram from a plain-language instruction. It is off by default and
        sends nothing until you turn it on, add a key and press Send.
      </p>
      <ul>
        <li>
          <strong>Who receives your text:</strong> {info.recipient}, through its API ({info.host}). Your browser
          contacts it directly; no PlantUML Ultimate server is involved.
        </li>
        <li>
          <strong>What is sent:</strong> the diagram you are editing with your selection marked, your instruction, and
          fixed instructions to the model. You can read the exact text before every request. Other tabs, project files,
          repository data, Jira data and collaboration peers are never sent.
        </li>
        <li>
          <strong>What comes back:</strong> a proposal only. Nothing is applied until you review it and press Apply, and
          it can be undone.
        </li>
        <li>
          <strong>Your key:</strong> kept in memory for this session unless you choose to remember it on this device.
          Each provider has its own key. It is never saved in documents, backups, exports, share links or collaboration
          sessions.
        </li>
      </ul>
      <p>
        You need a {info.consoleName} API key with credits from{" "}
        <a href={info.consoleUrl} target="_blank" rel="noopener noreferrer">
          {info.consoleHostLabel}
        </a>
        . {info.subscriptionNote}
      </p>
      <button type="button" onClick={() => enableAiAssistant()}>
        {state.enabled
          ? `I understand, use ${info.label}`
          : consented
            ? "Turn on AI assistant"
            : "I understand, turn on AI assistant"}
      </button>
    </div>
  );
}

function ProviderControls({ info, state }: { info: AiProviderInfo; state: AiAssistantState }) {
  const [draftKey, setDraftKey] = useState("");
  const [remember, setRemember] = useState(state.remember);
  const [notice, setNotice] = useState("");
  const [customMode, setCustomMode] = useState(!isKnownAiModel(state.model, info.id));
  const [customDraft, setCustomDraft] = useState(isKnownAiModel(state.model, info.id) ? "" : state.model);
  const known = findAiModel(info.id, state.model);

  return (
    <>
      <p>The AI assistant is on. These settings take effect immediately.</p>
      <label>
        Model
        <select
          value={customMode ? CUSTOM_MODEL : state.model}
          onChange={(event) => {
            if (event.target.value === CUSTOM_MODEL) {
              setCustomMode(true);
              setCustomDraft(state.model);
              return;
            }
            setCustomMode(false);
            setAiModel(event.target.value);
          }}
        >
          {modelsFor(info.id).map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
          <option value={CUSTOM_MODEL}>Custom model id…</option>
        </select>
      </label>
      {customMode && (
        <label>
          Custom model id
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={customDraft}
            onChange={(event) => {
              setCustomDraft(event.target.value);
              if (isValidModelId(event.target.value.trim())) setAiModel(event.target.value.trim());
            }}
            onKeyDown={(event) => {
              // Enter must not submit the whole Settings form.
              if (event.key === "Enter") event.preventDefault();
            }}
          />
        </label>
      )}
      <p>
        {customMode
          ? `Uses the model id exactly as typed. Currently ${state.model}.${known ? "" : " Without a price in the table, usage is shown as tokens only."}`
          : known?.description}
      </p>
      <label>
        {info.label} API key
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={state.hasKey ? "A key is set. Paste a new one to replace it." : info.keyPlaceholder}
          value={draftKey}
          onChange={(event) => setDraftKey(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the whole Settings form.
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      <p>
        Get a key from{" "}
        <a href={info.consoleUrl} target="_blank" rel="noopener noreferrer">
          {info.consoleHostLabel}
        </a>
        . Text goes to {info.recipient} ({info.host}).
      </p>
      <label className="ai-remember">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
        Remember this key on this device
      </label>
      <p>
        {remember
          ? "The key is stored in this browser's IndexedDB until you press Forget key. Anyone who can use this browser profile can use it."
          : "The key stays in memory and is gone when you close or reload this page."}
      </p>
      <div className="ai-key-actions">
        <button
          type="button"
          disabled={!draftKey.trim()}
          onClick={async () => {
            const stored = await saveAiKey(draftKey, remember, info.id);
            setDraftKey("");
            setNotice(
              remember && !stored
                ? "Key saved for this session only. This browser would not store it on the device."
                : remember
                  ? "Key saved on this device."
                  : "Key saved for this session.",
            );
          }}
        >
          Save key
        </button>
        <button
          type="button"
          disabled={!state.hasKey}
          onClick={async () => {
            await forgetAiKey(info.id);
            setRemember(false);
            setNotice("Key forgotten.");
          }}
        >
          Forget key
        </button>
        <button type="button" onClick={() => disableAiAssistant()}>
          Turn off AI assistant
        </button>
      </div>
      <p role="status" className="ai-key-status">
        {notice || (state.hasKey ? "A key is set." : "No key set. Requests cannot be sent yet.")}
      </p>
    </>
  );
}
