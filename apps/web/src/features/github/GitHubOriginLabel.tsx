import { describeGitHubOrigin, safeGitHubUrl, type GitHubOrigin } from "./github-origin";

/** Shown next to the document name for a tab that was opened from GitHub. */
export function GitHubOriginLabel({ origin, onPropose }: { origin: GitHubOrigin; onPropose?: () => void }) {
  const label = describeGitHubOrigin(origin);
  const proposal = origin.proposal;
  return (
    <span className="github-origin" data-testid="github-origin">
      <span className="github-origin-label" title={label}>
        {label}
      </span>
      {safeGitHubUrl(origin.htmlUrl) && (
        <a href={origin.htmlUrl} target="_blank" rel="noopener noreferrer">
          Open on GitHub
        </a>
      )}
      {proposal && safeGitHubUrl(proposal.htmlUrl) && (
        <a
          className="github-pr-badge"
          href={proposal.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Pull request #${proposal.number} on branch ${proposal.branch}: review and merge it on GitHub`}
        >
          PR #{proposal.number}
        </a>
      )}
      {onPropose && (
        <button type="button" className="github-origin-propose" onClick={onPropose}>
          Propose change…
        </button>
      )}
    </span>
  );
}
