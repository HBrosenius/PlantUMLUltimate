import { useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../../use-dialog-focus";
import { describeGitError, targetKey, useGitProvider, useHostTarget, wordingFor } from "./git-hosts";
import { isSafeOriginLink, type GitOrigin } from "./git-origin";
import { GitProviderError, type GitProviderId, type GitReview } from "./git-provider";
import {
  addFirstFile,
  createNewFileMarkdown,
  defaultNewFilePath,
  proposeNewFile,
  validateNewFilePath,
} from "./git-new-file";
import { defaultProposalBranch } from "./git-propose";
import { GitRepositoryPicker, type GitRepositorySelection } from "./GitRepositoryPicker";
import { OpenReviewLink, ProposalDone } from "./ProposalDone";

/**
 * Propose as new file: for a diagram that is not on a Git host yet. Commits it to a new branch of a repository
 * (GitHub) or project (GitLab) the token can write to and opens a pull or merge request. The tab then counts as
 * opened from that file, so Propose change adds further commits to the same request.
 */
export function ProposeNewFileDialog({
  provider = "github",
  source,
  fileName,
  onProposed,
  onClose,
  onOpenSettings,
  fetchImpl,
}: {
  provider?: GitProviderId;
  source: string;
  fileName: string;
  onProposed(origin: GitOrigin): void;
  onClose(): void;
  onOpenSettings(): void;
  fetchImpl?: typeof fetch;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  const { target, servers, server, chooseServer } = useHostTarget(provider);
  const { ready, provider: client } = useGitProvider(target, fetchImpl);
  const words = wordingFor(provider);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{
    review: GitReview;
    repository: string;
    branch: string;
    base: string;
  }>();
  const [selection, setSelectionState] = useState<GitRepositorySelection>();
  /** The chosen repository has no commits, so the file can only become its first commit. */
  const [emptyRepository, setEmptyRepository] = useState(false);
  const [firstCommit, setFirstCommit] = useState<{ origin: GitOrigin; repository: string }>();
  // Branch, commit message and title follow the file path until the user edits them.
  const [edited, setEdited] = useState({ branch: false, commitMessage: false, title: false });
  const setSelection = (next: GitRepositorySelection | undefined) => {
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
      setError(describeGitError(failure, words.name));
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
        review: result.pullRequest,
        repository: selection.repo.fullName,
        branch: result.origin.proposal?.branch ?? branch.trim(),
        base: selection.branch,
      });
    } catch (failure) {
      if (failure instanceof GitProviderError && failure.kind === "empty-repository") setEmptyRepository(true);
      else setError(describeGitError(failure, words.name));
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
        aria-label={`Propose as new file on ${words.name}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || finished) return;
          void (emptyRepository ? submitFirstCommit() : submit());
        }}
      >
        <header>
          <h2>Propose as new file on {words.name}</h2>
        </header>
        {!ready ? (
          <p role="status">Checking for a saved token…</p>
        ) : !client ? (
          <>
            <p>To propose a file, {words.tokenAdvice.write}. It stays in this browser.</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
            >
              Open Settings → {words.name}
            </button>
          </>
        ) : firstCommit ? (
          <div className="github-proposal-done" role="status">
            <p className="github-proposal-done-title">
              Added {firstCommit.origin.path} to {firstCommit.repository} as its first commit on{" "}
              {firstCommit.origin.ref}.
            </p>
            <p>
              The {words.repository} was empty, so there was no branch for a {words.reviewName}. From now on, edit the
              diagram and choose <strong>Propose change…</strong> next to the {words.name} label at the top: changes are
              proposed as {words.reviewName}s.
            </p>
          </div>
        ) : done ? (
          <ProposalDone
            provider={client.info}
            review={done.review}
            repository={done.repository}
            branch={done.branch}
            base={done.base}
            updated={false}
            newFile
          />
        ) : (
          <>
            <p>
              Adds this diagram to a {words.repository} as a new file: it is committed to a new branch and a{" "}
              {words.reviewName} is opened into the base branch.
            </p>
            {servers.length > 1 && (
              <label>
                GitLab server
                <select
                  value={server}
                  disabled={busy}
                  onChange={(event) => {
                    chooseServer(event.target.value);
                    setSelection(undefined);
                  }}
                >
                  {servers.map((item) => (
                    <option key={item} value={item}>
                      {new URL(item).host}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <GitRepositoryPicker
              key={targetKey(target)}
              client={client}
              busy={busy}
              branchLabel="Base branch"
              onChange={setSelection}
            />
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
              {words.reviewTitle} title
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
              <strong>{selection.repo.fullName} is empty.</strong> It has no commits yet, so there is no branch a{" "}
              {words.reviewName} could go into.
            </p>
            <p>
              You can add this diagram as the {words.repository}'s first commit, directly on{" "}
              <code>{selection.repo.defaultBranch}</code>. Later changes are proposed as {words.reviewName}s as usual.
            </p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {finished ? "Close" : "Cancel"}
          </button>
          {client && done && <OpenReviewLink provider={client.info} review={done.review} />}
          {firstCommit && isSafeOriginLink(firstCommit.origin, firstCommit.origin.htmlUrl) && (
            <a className="github-open-pr" href={firstCommit.origin.htmlUrl} target="_blank" rel="noopener noreferrer">
              Open {firstCommit.origin.path} on {words.name}
            </a>
          )}
          {client && !finished && emptyRepository && selection && (
            <button type="submit" className="primary" disabled={busy || !!pathProblem}>
              {busy ? "Adding…" : `Add as first commit on ${selection.repo.defaultBranch}`}
            </button>
          )}
          {client && !finished && !emptyRepository && (
            <button type="submit" className="primary" disabled={busy || !selection || !!pathProblem || !branch.trim()}>
              {busy ? "Proposing…" : `Open ${words.reviewName}`}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
