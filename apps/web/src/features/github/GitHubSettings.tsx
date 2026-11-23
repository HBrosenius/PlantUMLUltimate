import { useEffect, useState, useSyncExternalStore } from "react";
import { createGitHubClient, GitHubError } from "./github-client";
import {
  forgetGitHubToken,
  getGitHubState,
  getGitHubToken,
  loadRememberedGitHubToken,
  saveGitHubToken,
  subscribeGitHub,
} from "./github-settings";

export const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

/**
 * Settings > GitHub. Like the AI assistant page, its controls act immediately (they are not part of the dialog's
 * Apply), so the token can be forgotten at once.
 */
export function GitHubSettings({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const state = useSyncExternalStore(subscribeGitHub, getGitHubState);
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(state.remember);
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string }>();

  useEffect(() => {
    void loadRememberedGitHubToken();
  }, []);

  async function save(): Promise<boolean> {
    if (!draft.trim()) return state.hasToken;
    const stored = await saveGitHubToken(draft, remember);
    setDraft("");
    setNotice(
      remember && !stored
        ? "Token saved for this session only. This browser would not store it on the device."
        : remember
          ? "Token saved on this device."
          : "Token saved for this session.",
    );
    return true;
  }

  async function test() {
    setTesting(true);
    setResult(undefined);
    try {
      if (!(await save())) return;
      const client = createGitHubClient({ token: getGitHubToken() ?? "", ...(fetchImpl ? { fetch: fetchImpl } : {}) });
      const user = await client.getUser();
      const repositories = await client.listRepositories();
      const count = `${repositories.items.length}${repositories.truncated ? "+" : ""}`;
      setResult({
        ok: true,
        message: `Connected as ${user.login}. The token reaches ${count} ${repositories.items.length === 1 && !repositories.truncated ? "repository" : "repositories"}.`,
      });
    } catch (error) {
      setResult({ ok: false, message: error instanceof GitHubError ? error.message : "The connection test failed." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <h3 id="settings-github-heading">GitHub</h3>
      <p>
        Connect GitHub to open diagram files from your repositories and to propose changes or new files as pull
        requests. Your browser talks to GitHub directly; no PlantUML Ultimate server is involved.
      </p>
      <p>Create a fine-grained personal access token:</p>
      <ol>
        <li>
          Open{" "}
          <a href={NEW_TOKEN_URL} target="_blank" rel="noopener noreferrer">
            github.com/settings/personal-access-tokens/new
          </a>
          .
        </li>
        <li>Under Repository access, choose Only select repositories and pick the ones you want to reach.</li>
        <li>
          Under Repository permissions, set <strong>Contents</strong> to Read-only.
        </li>
      </ol>
      <p>
        To propose changes as pull requests, set <strong>Contents</strong> and <strong>Pull requests</strong> to Read
        and write instead. Read-only is enough for opening files.
      </p>
      <label>
        GitHub token
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={state.hasToken ? "A token is set. Paste a new one to replace it." : "github_pat_…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the whole Settings form.
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      <label className="ai-remember">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
        Remember on this device
      </label>
      <p>
        {remember
          ? "The token is stored in this browser's IndexedDB until you press Forget token. Anyone who can use this browser profile can use it."
          : "The token stays in memory and is gone when you close or reload this page."}{" "}
        It is never saved in documents, backups, snapshots, exports, share links or collaboration sessions.
      </p>
      <div className="ai-key-actions">
        <button type="button" disabled={!draft.trim()} onClick={() => void save()}>
          Save token
        </button>
        <button type="button" disabled={testing || (!draft.trim() && !state.hasToken)} onClick={() => void test()}>
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          disabled={!state.hasToken}
          onClick={async () => {
            await forgetGitHubToken();
            setRemember(false);
            setResult(undefined);
            setNotice("Token forgotten.");
          }}
        >
          Forget token
        </button>
      </div>
      <p role="status" className="ai-key-status">
        {result?.message ?? (notice || (state.hasToken ? "A token is set." : "No token set."))}
      </p>
    </>
  );
}
