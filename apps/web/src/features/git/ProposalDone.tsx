import { isLinkOnServer } from "./git-origin";
import { wordingFor } from "./git-hosts";
import type { GitProviderInfo, GitReview } from "./git-provider";

/**
 * What happened, and what to do next, after a proposal. The file only reaches the base branch once the pull or
 * merge request is merged on the host, so that is said plainly.
 */
export function ProposalDone({
  provider,
  review,
  repository,
  branch,
  base,
  updated,
  newFile,
}: {
  provider: GitProviderInfo;
  review: GitReview;
  repository: string;
  branch: string;
  base: string;
  updated: boolean;
  newFile: boolean;
}) {
  const words = wordingFor(provider.id);
  return (
    <div className="github-proposal-done" role="status">
      <p className="github-proposal-done-title">
        {updated
          ? `Added a commit to ${words.reviewName} ${review.label} and updated its description.`
          : `Opened ${words.reviewName} ${review.label} in ${repository}.`}
      </p>
      <p>
        <strong>Next: review and merge it on {words.name}.</strong> Until it is merged,{" "}
        {newFile ? "the file" : "your change"} is only on branch <code>{branch}</code>, not on <code>{base}</code>.
      </p>
      <p>
        To change it further, edit the diagram and choose <strong>Propose change…</strong> next to the {words.name}{" "}
        label at the top. Each proposal adds a commit to this {words.reviewName}.
      </p>
    </div>
  );
}

/** The footer button that opens the pull or merge request on the host. */
export function OpenReviewLink({ provider, review }: { provider: GitProviderInfo; review: GitReview }) {
  if (!isLinkOnServer(provider.server, review.htmlUrl)) return null;
  const words = wordingFor(provider.id);
  return (
    <a className="github-open-pr" href={review.htmlUrl} target="_blank" rel="noopener noreferrer">
      Open {words.reviewName} {review.label} on {words.name}
    </a>
  );
}
