import { useEffect, useState, useSyncExternalStore } from "react";
import {
  disableAiAssistant,
  enableAiAssistant,
  forgetAiKey,
  getAiAssistantState,
  loadRememberedAiKey,
  saveAiKey,
  setAiModel,
  subscribeAiAssistant,
} from "./ai-settings";
import { AI_MODELS } from "./models";

export const CONSOLE_URL = "https://platform.claude.com/";

/**
 * Settings > AI assistant. Unlike the other settings pages its controls act immediately (they are not part of
 * the dialog's Apply), because the key must be forgettable at once and consent is a deliberate step.
 */
export function AiAssistantSettings() {
  const state = useSyncExternalStore(subscribeAiAssistant, getAiAssistantState);
  const [draftKey, setDraftKey] = useState("");
  const [remember, setRemember] = useState(state.remember);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadRememberedAiKey();
  }, []);

  const consented = state.consentedAt !== undefined;

  return (
    <>
      <h3 id="settings-ai-heading">AI assistant</h3>
      {!state.enabled ? (
        <div className="ai-consent" role="group" aria-label="Turn on the AI assistant">
          <p>
            The AI assistant can propose changes to a diagram from a plain-language instruction. It is off by default
            and sends nothing until you turn it on, add a key and press Send.
          </p>
          <ul>
            <li>
              <strong>Who receives your text:</strong> Anthropic, through its API (api.anthropic.com). Your browser
              contacts it directly; no PlantUML Ultimate server is involved.
            </li>
            <li>
              <strong>What is sent:</strong> the diagram you are editing with your selection marked, your instruction,
              and fixed instructions to the model. You can read the exact text before every request. Other tabs, project
              files, repository data, Jira data and collaboration peers are never sent.
            </li>
            <li>
              <strong>What comes back:</strong> a proposal only. Nothing is applied until you review it and press Apply,
              and it can be undone.
            </li>
            <li>
              <strong>Your key:</strong> kept in memory for this session unless you choose to remember it on this
              device. It is never saved in documents, backups, exports, share links or collaboration sessions.
            </li>
          </ul>
          <p>
            You need a Claude Console API key with credits from{" "}
            <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer">
              platform.claude.com
            </a>
            . A Claude Pro or Max subscription does not include API access and cannot be used here.
          </p>
          <button type="button" onClick={() => enableAiAssistant()}>
            {consented ? "Turn on AI assistant" : "I understand, turn on AI assistant"}
          </button>
        </div>
      ) : (
        <>
          <p>The AI assistant is on. These settings take effect immediately.</p>
          <label>
            Model
            <select value={state.model} onChange={(event) => setAiModel(event.target.value)}>
              {AI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <p>{AI_MODELS.find((model) => model.id === state.model)?.description}</p>
          <label>
            Anthropic API key
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={state.hasKey ? "A key is set. Paste a new one to replace it." : "sk-ant-..."}
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              onKeyDown={(event) => {
                // Enter must not submit the whole Settings form.
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </label>
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
                const stored = await saveAiKey(draftKey, remember);
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
                await forgetAiKey();
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
      )}
    </>
  );
}
