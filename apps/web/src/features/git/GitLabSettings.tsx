import { useEffect, useState, useSyncExternalStore } from "react";
import { normalizeServer } from "./git-origin";
import { GitProviderError } from "./git-provider";
import { createGitLabClient } from "./gitlab-client";
import {
  forgetGitLabToken,
  getGitLabState,
  getGitLabToken,
  gitLabHasToken,
  loadRememberedGitLabTokens,
  saveGitLabToken,
  subscribeGitLab,
} from "./gitlab-settings";

/**
 * Settings > GitLab. Like the GitHub page, its controls act immediately (they are not part of the dialog's
 * Apply). The token belongs to the server address above it: another address is another token, and a token is
 * only ever sent to its own server.
 */
export function GitLabSettings({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const state = useSyncExternalStore(subscribeGitLab, getGitLabState);
  const [serverDraft, setServerDraft] = useState(state.server);
  const server = normalizeServer(serverDraft);
  const hasToken = server !== undefined && state.servers.includes(server);
  const [rememberDraft, setRememberDraft] = useState<boolean>();
  const remember = rememberDraft ?? (server !== undefined && state.remembered.includes(server));
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string }>();

  useEffect(() => {
    void loadRememberedGitLabTokens();
  }, []);

  function changeServer(value: string) {
    setServerDraft(value);
    setRememberDraft(undefined);
    setResult(undefined);
    setNotice("");
  }

  async function save(): Promise<boolean> {
    if (!server) return false;
    if (!draft.trim()) return gitLabHasToken(server);
    const stored = await saveGitLabToken(server, draft, remember);
    setDraft("");
    setRememberDraft(undefined);
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
      if (!(await save()) || !server) return;
      const client = createGitLabClient({
        server,
        token: getGitLabToken(server) ?? "",
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
      });
      const user = await client.getUser();
      const projects = await client.listRepositories();
      const count = `${projects.items.length}${projects.truncated ? "+" : ""}`;
      setResult({
        ok: true,
        message: `Connected as ${user.login}. The token reaches ${count} ${projects.items.length === 1 && !projects.truncated ? "project" : "projects"}.`,
      });
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof GitProviderError ? error.message : "The connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  const host = server ? new URL(server).host : undefined;
  return (
    <>
      <h3 id="settings-gitlab-heading">GitLab</h3>
      <p>
        Connect GitLab, on gitlab.com or on your own server, to open diagram files from your projects and to propose
        changes or new files as merge requests. Your browser talks to your GitLab server directly; no PlantUML Ultimate
        server is involved.
      </p>
      <label>
        GitLab server
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://gitlab.com"
          value={serverDraft}
          aria-invalid={server ? undefined : true}
          onChange={(event) => changeServer(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the whole Settings form.
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      {!server && (
        <p role="alert">
          Enter the server's https address, for example https://gitlab.com or https://gitlab.example.com, without a
          path.
        </p>
      )}
      <p>
        Each server has its own token. A token is only ever sent to the server it is saved for. Self-managed servers
        must allow requests from this app's address (CORS); if yours does not, the connection test says so.
      </p>
      <p>Create a token with the api scope on {host ?? "your server"}. There are two kinds:</p>
      <ul>
        <li>
          <strong>Project access token</strong> (the narrower choice): in the project, open Settings → Access tokens,
          pick the Developer role and the <strong>api</strong> scope. It reaches that one project only.
        </li>
        <li>
          <strong>Personal access token</strong>: in your profile, open Access tokens and pick the <strong>api</strong>{" "}
          scope. It reaches everything your account can.
        </li>
      </ul>
      <p>
        The api scope is needed to propose changes. A token with only read_api is enough for opening files, but not for
        proposing.
      </p>
      <label>
        GitLab token
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasToken ? "A token is set. Paste a new one to replace it." : "glpat-…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      <label className="ai-remember">
        <input type="checkbox" checked={remember} onChange={(event) => setRememberDraft(event.target.checked)} />
        Remember on this device
      </label>
      <p>
        {remember
          ? "The token is stored in this browser's IndexedDB until you press Forget token. Anyone who can use this browser profile can use it."
          : "The token stays in memory and is gone when you close or reload this page."}{" "}
        It is never saved in documents, backups, snapshots, exports, share links or collaboration sessions.
      </p>
      <div className="ai-key-actions">
        <button type="button" disabled={!server || !draft.trim()} onClick={() => void save()}>
          Save token
        </button>
        <button type="button" disabled={testing || !server || (!draft.trim() && !hasToken)} onClick={() => void test()}>
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          disabled={!hasToken}
          onClick={async () => {
            if (!server) return;
            await forgetGitLabToken(server);
            setRememberDraft(undefined);
            setResult(undefined);
            setNotice("Token forgotten.");
          }}
        >
          Forget token
        </button>
      </div>
      <p role="status" className="ai-key-status">
        {result?.message ?? (notice || (hasToken ? "A token is set." : "No token set."))}
      </p>
    </>
  );
}
