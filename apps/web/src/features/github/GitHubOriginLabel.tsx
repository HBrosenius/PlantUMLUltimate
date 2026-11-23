import { describeGitHubOrigin, safeGitHubUrl, type GitHubOrigin } from "./github-origin";

/** Shown next to the document name for a tab that was opened from GitHub. */
export function GitHubOriginLabel({ origin }: { origin: GitHubOrigin }) {
  const label = describeGitHubOrigin(origin);
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
    </span>
  );
}
