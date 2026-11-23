import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DiagramKind } from "../../model";
import { buildReviewGroups } from "../../semantic-review";
import { useDialogFocus } from "../../use-dialog-focus";
import { createGitHubClient, GitHubError, type GitHubClient, type GitHubPullRequest } from "./github-client";
import { safeGitHubUrl, type GitHubOrigin } from "./github-origin";
import {
  createReviewMarkdown,
  defaultProposalBranch,
  openProposal,
  proposeChange,
  UpstreamChangedError,
} from "./github-propose";
import { mergeUpstream, type UpstreamMerge } from "./github-upstream";
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
  onSourceMerged,
  onClose,
  onOpenSettings,
  fetchImpl,
}: {
  origin: GitHubOrigin;
  source: string;
  fileName: string;
  diagramKind: DiagramKind;
  onProposed(origin: GitHubOrigin): void;
  /** Replaces the tab's source with the merged one and moves its origin to the newer version. False if it could not be applied. */
  onSourceMerged(source: string, origin: GitHubOrigin): boolean;
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
  const [upstream, setUpstream] = useState<UpstreamMerge>();
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

  // Reloaded when the tab's base blob changes (after merging newer upstream changes); proposing alone needs no reload.
  const originRef = useRef(origin);
  originRef.current = origin;
  const { owner: originOwner, repo: originRepo, sha: originSha } = origin;
  useEffect(() => {
    if (!client) return;
    let current = true;
    setError("");
    void Promise.all([client.getBlobText(originOwner, originRepo, originSha), openProposal(client, originRef.current)])
      .then(([base, existing]) => {
        if (current) setLoaded({ base, existing });
      })
      .catch((failure: unknown) => {
        if (current) setError(message(failure));
      });
    return () => {
      current = false;
    };
  }, [client, originOwner, originRepo, originSha]);

  const body = useMemo(
    () =>
      loaded
        ? createReviewMarkdown(origin.path, loaded.base, source, buildReviewGroups(loaded.base, source, diagramKind))
        : "",
    [loaded, origin.path, source, diagramKind],
  );
  const unchanged = loaded !== undefined && loaded.base.replace(/\r\n/g, "\n") === source.replace(/\r\n/g, "\n");
  const existing = loaded?.existing;

  async function submit(merge?: Extract<UpstreamMerge, { kind: "merged" }>) {
    if (!client || !loaded) return;
    setBusy(true);
    setError("");
    try {
      const target = merge?.origin ?? origin;
      const proposalSource = merge?.merged ?? source;
      if (merge && !onSourceMerged(merge.merged, merge.origin)) {
        setError("The merged version could not be applied to the tab.");
        return;
      }
      setUpstream(undefined);
      // After a merge into a new proposal the newer upstream version is the base of the review.
      const reviewBase = merge && !origin.proposal ? merge.upstream : loaded.base;
      const result = await proposeChange(client, target, {
        source: proposalSource,
        body: merge
          ? createReviewMarkdown(
              origin.path,
              reviewBase,
              proposalSource,
              buildReviewGroups(reviewBase, proposalSource, diagramKind),
            )
          : body,
        commitMessage: commitMessage.trim() || `Update ${fileName}`,
        branch: branch.trim(),
        title: title.trim() || `Update ${fileName}`,
      });
      onProposed(result.origin);
      setDone({ pullRequest: result.pullRequest, updated: result.updated });
    } catch (failure) {
      if (failure instanceof UpstreamChangedError) {
        // Read the newer version and try to combine it with the tab's edits; nothing is committed yet.
        try {
          const result = await mergeUpstream(client, merge?.origin ?? origin, merge?.merged ?? source, failure);
          if (result.kind === "unchanged") setError(failure.message);
          else setUpstream(result);
        } catch (lookup) {
          setError(message(lookup));
        }
      } else setError(message(failure));
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
          if (!busy && !done && !unchanged && !upstream) void submit();
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
        ) : upstream?.kind === "conflict" ? (
          <>
            <p role="alert">
              {origin.path} changed on {upstream.branch} since you opened it, and the same parts were edited in both
              places: {upstream.regions.join(", ")} of your version. Nothing was committed.
            </p>
            <p>
              Open the file from GitHub again to start from the latest version, then make your changes there. Copy your
              edits first if you want to keep them.
            </p>
          </>
        ) : upstream?.kind === "merged" ? (
          <UpstreamReview merge={upstream} path={origin.path} diagramKind={diagramKind} />
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
          {client && loaded && !done && upstream?.kind === "merged" && (
            <button
              type="button"
              className="primary"
              disabled={busy || upstream.nothingToPropose}
              onClick={() => void submit(upstream)}
            >
              {busy ? "Proposing…" : "Use merged version and propose"}
            </button>
          )}
          {client && loaded && !done && !upstream && (
            <button type="submit" className="primary" disabled={busy || (unchanged && !existing)}>
              {busy ? "Proposing…" : existing ? "Add commit" : "Open pull request"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

function ReviewList({ title, groups }: { title: string; groups: ReturnType<typeof buildReviewGroups> }) {
  return (
    <section className="github-upstream-review">
      <h3>{title}</h3>
      {groups.length ? (
        <ul>
          {groups.map((group, index) => (
            <li key={index}>
              {group.title}
              {group.detail ? ` — ${group.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p>No changes.</p>
      )}
    </section>
  );
}

/** A clean merge of the tab's edits and the newer version, shown before anything is committed. */
function UpstreamReview({
  merge,
  path,
  diagramKind,
}: {
  merge: Extract<UpstreamMerge, { kind: "merged" }>;
  path: string;
  diagramKind: DiagramKind;
}) {
  const upstreamChanges = useMemo(
    () => buildReviewGroups(merge.base, merge.upstream, diagramKind),
    [merge, diagramKind],
  );
  const yourChanges = useMemo(() => buildReviewGroups(merge.upstream, merge.merged, diagramKind), [merge, diagramKind]);
  return (
    <>
      <p role="status">
        {path} changed on {merge.branch} since you opened it. Your changes were merged with the newer version.
      </p>
      <ReviewList title={`What changed on ${merge.branch}`} groups={upstreamChanges} />
      <ReviewList title="What your proposal will add on top" groups={yourChanges} />
      {merge.nothingToPropose && (
        <p>The newer version already contains your changes, so there is nothing to propose.</p>
      )}
    </>
  );
}
