import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDialogFocus } from "../../use-dialog-focus";
import { GitProviderError } from "../git/git-provider";
import { createGitHubClient, type GitHubClient, type GitHubPullRequest } from "./github-client";
import {
  addFirstFile,
  createNewFileMarkdown,
  defaultNewFilePath,
  proposeNewFile,
  validateNewFilePath,
} from "./github-new-file";
import { isSafeOriginLink, type GitOrigin } from "../git/git-origin";
import { defaultProposalBranch } from "./github-propose";
import { getGitHubState, getGitHubToken, loadRememberedGitHubToken, subscribeGitHub } from "./github-settings";
import { GitHubRepositoryPicker, type GitHubRepositorySelection } from "./GitHubRepositoryPicker";
import { OpenPullRequestLink, ProposalDone } from "./ProposalDone";

const message = (error: unknown) =>
  error instanceof GitProviderError ? error.message : "Something went wrong while talking to GitHub.";

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
  onProposed(origin: GitOrigin): void;
  onClose(): void;
  onOpenSettings(): void;
  fetchImpl?: typeof fetch;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const state = useSyncExternalStore(subscribeGitHub, getGitHubState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{
    pullRequest: GitHubPullRequest;
    repository: string;
    branch: string;
    base: string;
  }>();
  const [selection, setSelectionState] = useState<GitHubRepositorySelection>();
  /** The chosen repository has no commits, so the file can only become its first commit. */
  const [emptyRepository, setEmptyRepository] = useState(false);
  const [firstCommit, setFirstCommit] = useState<{ origin: GitOrigin; repository: string }>();
  // Branch, commit message and title follow the file path until the user edits them.
  const [edited, setEdited] = useState({ branch: false, commitMessage: false, title: false });
  const setSelection = (next: GitHubRepositorySelection | undefined) => {
    setSelectionState(next);
    setEmptyRepository(false);
    setError("");
  };
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

  function changePath(next: string) {
    setPath(next);
    const name = next.trim().split("/").pop() || defaultPath;
    if (!edited.branch) setBranch(defaultProposalBranch(name));
    if (!edited.commitMessage) setCommitMessage(`Add ${name}`);
    if (!edited.title) setTitle(`Add ${name}`);
  }

  async function submitFirstCommit() {
    if (!client || !selection || pathProblem) return;
    setBusy(true);
    setError("");
    try {
      const origin = await addFirstFile(client, {
        owner: selection.repo.owner,
        repo: selection.repo.name,
        defaultBranch: selection.repo.defaultBranch,
        path: trimmedPath,
        source,
        commitMessage: commitMessage.trim() || `Add ${justName}`,
      });
      onProposed(origin);
      setFirstCommit({ origin, repository: selection.repo.fullName });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

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
      setDone({
        pullRequest: result.pullRequest,
        repository: selection.repo.fullName,
        branch: result.origin.proposal?.branch ?? branch.trim(),
        base: selection.branch,
      });
    } catch (failure) {
      if (failure instanceof GitProviderError && failure.kind === "empty-repository") setEmptyRepository(true);
      else setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  const finished = done !== undefined || firstCommit !== undefined;
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
          if (busy || finished) return;
          void (emptyRepository ? submitFirstCommit() : submit());
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
        ) : firstCommit ? (
          <div className="github-proposal-done" role="status">
            <p className="github-proposal-done-title">
              Added {firstCommit.origin.path} to {firstCommit.repository} as its first commit on{" "}
              {firstCommit.origin.ref}.
            </p>
            <p>
              The repository was empty, so there was no branch for a pull request. From now on, edit the diagram and
              choose <strong>Propose change…</strong> next to the GitHub label at the top: changes are proposed as pull
              requests.
            </p>
          </div>
        ) : done ? (
          <ProposalDone
            pullRequest={done.pullRequest}
            repository={done.repository}
            branch={done.branch}
            base={done.base}
            updated={false}
            newFile
          />
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
                onChange={(event) => changePath(event.target.value)}
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
                onChange={(event) => {
                  setBranch(event.target.value);
                  setEdited((current) => ({ ...current, branch: true }));
                }}
              />
            </label>
            <label>
              Commit message
              <input
                value={commitMessage}
                maxLength={500}
                onChange={(event) => {
                  setCommitMessage(event.target.value);
                  setEdited((current) => ({ ...current, commitMessage: true }));
                }}
              />
            </label>
            <label>
              Pull request title
              <input
                value={title}
                maxLength={250}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setEdited((current) => ({ ...current, title: true }));
                }}
              />
            </label>
            <details className="github-propose-preview">
              <summary>Description preview</summary>
              <pre data-testid="github-propose-body">{body}</pre>
            </details>
          </>
        )}
        {emptyRepository && !finished && selection && (
          <div className="github-empty-repository" role="alert">
            <p>
              <strong>{selection.repo.fullName} is empty.</strong> It has no commits yet, so there is no branch a pull
              request could go into.
            </p>
            <p>
              You can add this diagram as the repository's first commit, directly on{" "}
              <code>{selection.repo.defaultBranch}</code>. Later changes are proposed as pull requests as usual.
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {finished ? "Close" : "Cancel"}
          </button>
          {done && <OpenPullRequestLink pullRequest={done.pullRequest} />}
          {firstCommit && isSafeOriginLink(firstCommit.origin, firstCommit.origin.htmlUrl) && (
            <a className="github-open-pr" href={firstCommit.origin.htmlUrl} target="_blank" rel="noopener noreferrer">
              Open {firstCommit.origin.path} on GitHub
            </a>
          )}
          {client && !finished && emptyRepository && selection && (
            <button type="submit" className="primary" disabled={busy || !!pathProblem}>
              {busy ? "Adding…" : `Add as first commit on ${selection.repo.defaultBranch}`}
            </button>
          )}
          {client && !finished && !emptyRepository && (
            <button type="submit" className="primary" disabled={busy || !selection || !!pathProblem || !branch.trim()}>
              {busy ? "Proposing…" : "Open pull request"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
