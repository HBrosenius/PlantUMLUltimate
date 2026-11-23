import type { GitHubPullRequest } from "./github-client";
import { safeGitHubUrl } from "./github-origin";

/**
 * What happened, and what to do next, after a proposal. The file only reaches the base branch once the pull
 * request is merged on GitHub, so that is said plainly.
 */
export function ProposalDone({
  pullRequest,
  repository,
  branch,
  base,
  updated,
  newFile,
}: {
  pullRequest: GitHubPullRequest;
  repository: string;
  branch: string;
  base: string;
  updated: boolean;
  newFile: boolean;
}) {
  return (
    <div className="github-proposal-done" role="status">
      <p className="github-proposal-done-title">
        {updated
          ? `Added a commit to pull request #${pullRequest.number} and updated its description.`
          : `Opened pull request #${pullRequest.number} in ${repository}.`}
      </p>
      <p>
        <strong>Next: review and merge it on GitHub.</strong> Until it is merged, {newFile ? "the file" : "your change"}{" "}
        is only on branch <code>{branch}</code>, not on <code>{base}</code>.
      </p>
      <p>
        To change it further, edit the diagram and choose <strong>Propose change…</strong> next to the GitHub label at
        the top. Each proposal adds a commit to this pull request.
      </p>
    </div>
  );
}

/** The footer button that opens the pull request on github.com. */
export function OpenPullRequestLink({ pullRequest }: { pullRequest: GitHubPullRequest }) {
  if (!safeGitHubUrl(pullRequest.htmlUrl)) return null;
  return (
    <a className="github-open-pr" href={pullRequest.htmlUrl} target="_blank" rel="noopener noreferrer">
      Open pull request #{pullRequest.number} on GitHub
    </a>
  );
}
