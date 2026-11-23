import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DiagramKind } from "../../model";
import { buildReviewGroups } from "../../semantic-review";
import { useDialogFocus } from "../../use-dialog-focus";
import { createGitHubClient, GitHubError, type GitHubClient, type GitHubPullRequest } from "./github-client";
import { safeGitHubUrl, type GitHubOrigin } from "./github-origin";
import { createReviewMarkdown, defaultProposalBranch, openProposal, proposeChange } from "./github-propose";
import { getGitHubState, getGitHubToken, loadRememberedGitHubToken, subscribeGitHub } from "./github-settings";

const message = (error: unknown) =>
  error instanceof GitHubError ? error.message : "Something went wrong while talking to GitHub.";

type Loaded = { base: string; existing: GitHubPullRequest | undefined };

/**
 * Propose change: commits the tab's source to a new branch and opens a pull request against the branch the file
 * came from, with the semantic review as its description. Proposing again while that pull request is open adds
 * a commit to it.
 */
export function ProposeChangeDialog({
  origin,
  source,
  fileName,
  diagramKind,
  onProposed,
  onClose,
  onOpenSettings,
  fetchImpl,
}: {
  origin: GitHubOrigin;
  source: string;
  fileName: string;
  diagramKind: DiagramKind;
  onProposed(origin: GitHubOrigin): void;
  onClose(): void;
  onOpenSettings(): void;
  fetchImpl?: typeof fetch;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const state = useSyncExternalStore(subscribeGitHub, getGitHubState);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ pullRequest: GitHubPullRequest; updated: boolean }>();
  const [branch, setBranch] = useState(() => defaultProposalBranch(fileName));
  const [commitMessage, setCommitMessage] = useState(`Update ${origin.path.split("/").pop() ?? fileName}`);
  const [title, setTitle] = useState(`Update ${origin.path.split("/").pop() ?? fileName}`);
  useDialogFocus(dialog, () => {
    if (!busy) onClose();
  });

  useEffect(() => {
    let current = true;
    void loadRememberedGitHubToken().then(() => {
      if (current) setReady(true);
    });
    return () => {
      current = false;
    };
  }, []);

  const client = useMemo<GitHubClient | undefined>(
    () =>
      state.hasToken
        ? createGitHubClient({ token: getGitHubToken() ?? "", ...(fetchImpl ? { fetch: fetchImpl } : {}) })
        : undefined,
    [state.hasToken, fetchImpl],
  );

  // Loaded once for the origin the dialog opened with; proposing updates the tab's origin but needs no reload.
  const [openedOrigin] = useState(origin);
  useEffect(() => {
    if (!client) return;
    let current = true;
    setError("");
    void Promise.all([
      client.getBlobText(openedOrigin.owner, openedOrigin.repo, openedOrigin.sha),
      openProposal(client, openedOrigin),
    ])
      .then(([base, existing]) => {
        if (current) setLoaded({ base, existing });
      })
      .catch((failure: unknown) => {
        if (current) setError(message(failure));
      });
    return () => {
      current = false;
    };
  }, [client, openedOrigin]);

  const body = useMemo(
    () =>
      loaded
        ? createReviewMarkdown(origin.path, loaded.base, source, buildReviewGroups(loaded.base, source, diagramKind))
        : "",
    [loaded, origin.path, source, diagramKind],
  );
  const unchanged = loaded !== undefined && loaded.base.replace(/\r\n/g, "\n") === source.replace(/\r\n/g, "\n");
  const existing = loaded?.existing;

  async function submit() {
    if (!client || !loaded) return;
    setBusy(true);
    setError("");
    try {
      const result = await proposeChange(client, origin, {
        source,
        body,
        commitMessage: commitMessage.trim() || `Update ${fileName}`,
        branch: branch.trim(),
        title: title.trim() || `Update ${fileName}`,
      });
      onProposed(result.origin);
      setDone({ pullRequest: result.pullRequest, updated: result.updated });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  const repository = `${origin.owner}/${origin.repo}`;
  return (
    <div className="modal-backdrop">
      <form
        ref={dialog}
        className="document-settings-dialog github-open-dialog github-propose-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Propose change on GitHub"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !done && !unchanged) void submit();
        }}
      >
        <header>
          <h2>Propose change on GitHub</h2>
        </header>
        {!ready ? (
          <p role="status">Checking for a saved token…</p>
        ) : !client ? (
          <>
            <p>
              To propose changes, add a fine-grained personal access token with Contents and Pull requests set to Read
              and write. It stays in this browser.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Open Settings → GitHub
            </button>
          </>
        ) : done ? (
          <p role="status">
            {done.updated
              ? `Added a commit to pull request #${done.pullRequest.number} and updated its description.`
              : `Opened pull request #${done.pullRequest.number} in ${repository}.`}{" "}
            {safeGitHubUrl(done.pullRequest.htmlUrl) && (
              <a href={done.pullRequest.htmlUrl} target="_blank" rel="noopener noreferrer">
                View pull request #{done.pullRequest.number}
              </a>
            )}
          </p>
        ) : !loaded ? (
          !error && <p role="status">Comparing with the version you opened…</p>
        ) : (
          <>
            <p>
              {existing ? (
                <>
                  Adds a commit to{" "}
                  {safeGitHubUrl(existing.htmlUrl) ? (
                    <a href={existing.htmlUrl} target="_blank" rel="noopener noreferrer">
                      pull request #{existing.number}
                    </a>
                  ) : (
                    `pull request #${existing.number}`
                  )}{" "}
                  on branch <code>{origin.proposal?.branch}</code>, and updates its description.
                </>
              ) : (
                <>
                  Commits <code>{origin.path}</code> to a new branch and opens a pull request into{" "}
                  <code>{origin.ref}</code> in {repository}.
                </>
              )}
            </p>
            {unchanged && !existing && <p role="status">There are no changes to propose yet.</p>}
            {!existing && (
              <label>
                Branch
                <input
                  required
                  spellCheck={false}
                  value={branch}
                  maxLength={200}
                  onChange={(event) => setBranch(event.target.value)}
                />
              </label>
            )}
            <label>
              Commit message
              <input value={commitMessage} maxLength={500} onChange={(event) => setCommitMessage(event.target.value)} />
            </label>
            {!existing && (
              <label>
                Pull request title
                <input value={title} maxLength={250} onChange={(event) => setTitle(event.target.value)} />
              </label>
            )}
            <details className="github-propose-preview">
              <summary>Description preview</summary>
              <pre data-testid="github-propose-body">{body}</pre>
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {done ? "Close" : "Cancel"}
          </button>
          {client && loaded && !done && (
            <button type="submit" className="primary" disabled={busy || (unchanged && !existing)}>
              {busy ? "Proposing…" : existing ? "Add commit" : "Open pull request"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
