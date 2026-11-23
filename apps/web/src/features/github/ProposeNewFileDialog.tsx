import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDialogFocus } from "../../use-dialog-focus";
import { createGitHubClient, GitHubError, type GitHubClient, type GitHubPullRequest } from "./github-client";
import { createNewFileMarkdown, defaultNewFilePath, proposeNewFile, validateNewFilePath } from "./github-new-file";
import { safeGitHubUrl, type GitHubOrigin } from "./github-origin";
import { defaultProposalBranch } from "./github-propose";
import { getGitHubState, getGitHubToken, loadRememberedGitHubToken, subscribeGitHub } from "./github-settings";
import { GitHubRepositoryPicker, type GitHubRepositorySelection } from "./GitHubRepositoryPicker";

const message = (error: unknown) =>
  error instanceof GitHubError ? error.message : "Something went wrong while talking to GitHub.";

/**
 * Propose as new file: for a diagram that is not on GitHub yet. Commits it to a new branch of a repository the
 * token can write to and opens a pull request. The tab then counts as opened from that file, so Propose change
 * adds further commits to the same pull request.
 */
export function ProposeNewFileDialog({
  source,
  fileName,
  onProposed,
  onClose,
  onOpenSettings,
  fetchImpl,
}: {
  source: string;
  fileName: string;
  onProposed(origin: GitHubOrigin): void;
  onClose(): void;
  onOpenSettings(): void;
  fetchImpl?: typeof fetch;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const state = useSyncExternalStore(subscribeGitHub, getGitHubState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ pullRequest: GitHubPullRequest; repository: string }>();
  const [selection, setSelection] = useState<GitHubRepositorySelection>();
  const defaultPath = useMemo(() => defaultNewFilePath(fileName), [fileName]);
  const [path, setPath] = useState(defaultPath);
  const [branch, setBranch] = useState(() => defaultProposalBranch(defaultPath));
  const [commitMessage, setCommitMessage] = useState(`Add ${defaultPath}`);
  const [title, setTitle] = useState(`Add ${defaultPath}`);
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

  const trimmedPath = path.trim();
  const pathProblem = validateNewFilePath(trimmedPath);
  const body = useMemo(() => createNewFileMarkdown(trimmedPath, source), [trimmedPath, source]);
  const justName = trimmedPath.split("/").pop() || defaultPath;

  async function submit() {
    if (!client || !selection || pathProblem) return;
    setBusy(true);
    setError("");
    try {
      const result = await proposeNewFile(client, {
        owner: selection.repo.owner,
        repo: selection.repo.name,
        base: selection.branch,
        path: trimmedPath,
        source,
        body,
        commitMessage: commitMessage.trim() || `Add ${justName}`,
        branch: branch.trim(),
        title: title.trim() || `Add ${justName}`,
      });
      onProposed(result.origin);
      setDone({ pullRequest: result.pullRequest, repository: selection.repo.fullName });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        ref={dialog}
        className="document-settings-dialog github-open-dialog github-propose-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Propose as new file on GitHub"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !done) void submit();
        }}
      >
        <header>
          <h2>Propose as new file on GitHub</h2>
        </header>
        {!ready ? (
          <p role="status">Checking for a saved token…</p>
        ) : !client ? (
          <>
            <p>
              To propose a file, add a fine-grained personal access token with Contents and Pull requests set to Read
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
            Opened pull request #{done.pullRequest.number} in {done.repository}. This tab is now linked to the file on
            GitHub, so Propose change adds commits to that pull request.{" "}
            {safeGitHubUrl(done.pullRequest.htmlUrl) && (
              <a href={done.pullRequest.htmlUrl} target="_blank" rel="noopener noreferrer">
                View pull request #{done.pullRequest.number}
              </a>
            )}
          </p>
        ) : (
          <>
            <p>
              Adds this diagram to a repository as a new file: it is committed to a new branch and a pull request is
              opened into the base branch.
            </p>
            <GitHubRepositoryPicker client={client} busy={busy} branchLabel="Base branch" onChange={setSelection} />
            <label>
              File path
              <input
                required
                spellCheck={false}
                autoComplete="off"
                value={path}
                maxLength={500}
                aria-invalid={pathProblem ? true : undefined}
                onChange={(event) => setPath(event.target.value)}
              />
            </label>
            {pathProblem && <p role="status">{pathProblem}</p>}
            <label>
              New branch name
              <input
                required
                spellCheck={false}
                value={branch}
                maxLength={200}
                onChange={(event) => setBranch(event.target.value)}
              />
            </label>
            <label>
              Commit message
              <input value={commitMessage} maxLength={500} onChange={(event) => setCommitMessage(event.target.value)} />
            </label>
            <label>
              Pull request title
              <input value={title} maxLength={250} onChange={(event) => setTitle(event.target.value)} />
            </label>
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
          {client && !done && (
            <button type="submit" className="primary" disabled={busy || !selection || !!pathProblem || !branch.trim()}>
              {busy ? "Proposing…" : "Open pull request"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
