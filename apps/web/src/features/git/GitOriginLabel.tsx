import { describeGitOrigin, isSafeOriginLink, originProvider, type GitOrigin } from "./git-origin";
import { reviewBadge, wordingFor } from "./git-hosts";

/**
 * Shown next to the document name for a tab that was opened from GitHub or GitLab. Links appear only for https
 * addresses on the origin's own server, whatever a stored record says.
 */
export function GitOriginLabel({ origin, onPropose }: { origin: GitOrigin; onPropose?: () => void }) {
  const label = describeGitOrigin(origin);
  const provider = originProvider(origin);
  const words = wordingFor(provider);
  const proposal = origin.proposal;
  return (
    <span className="github-origin" data-testid="github-origin" data-provider={provider}>
      <span className="github-origin-label" title={label}>
        {label}
      </span>
      {isSafeOriginLink(origin, origin.htmlUrl) && (
        <a href={origin.htmlUrl} target="_blank" rel="noopener noreferrer">
          Open on {words.name}
        </a>
      )}
      {proposal && isSafeOriginLink(origin, proposal.htmlUrl) && (
        <a
          className="github-pr-badge"
          href={proposal.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`${words.reviewTitle} ${words.numberSign}${proposal.number} on branch ${proposal.branch}: review and merge it on ${words.name}`}
        >
          {reviewBadge(provider, proposal.number)}
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
