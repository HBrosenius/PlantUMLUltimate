import type { ReviewGroup } from "../../semantic-review";
import { createUnifiedPatch } from "../../semantic-review";
import { GitHubError, type GitHubClient, type GitHubPullRequest } from "./github-client";
import type { GitHubOrigin } from "./github-origin";

/** GitHub refuses pull request bodies over 65,536 characters; stay well below. */
const MAX_BODY = 60_000;

const CONFIDENCE: Record<ReviewGroup["confidence"], string> = {
  confirmed: "confirmed",
  probable: "probable",
  unclassified: "unclassified",
};

/**
 * Text from the diagram goes into Markdown that GitHub renders, so it is kept literal: HTML-significant
 * characters become entities and Markdown punctuation is backslash-escaped. Line breaks become spaces.
 */
export function escapeMarkdown(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}[\]()#+\-.!|~])/g, "\\$1");
}

/** A code fence longer than any run of backticks in the text, so the text cannot close it. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The pull request description: the semantic review (change groups with confidence), then the unified patch in
 * a collapsed block. A patch too long for GitHub's limit is cut, and the description says so.
 */
export function createReviewMarkdown(
  path: string,
  leftSource: string,
  rightSource: string,
  groups: readonly ReviewGroup[],
): string {
  const count = `${groups.length} change group${groups.length === 1 ? "" : "s"}`;
  const items = groups.length
    ? groups.map((group) => {
        const detail = group.detail ? ` — ${escapeMarkdown(group.detail)}` : "";
        return `- **${escapeMarkdown(group.title)}**${detail} _(${CONFIDENCE[group.confidence]})_`;
      })
    : ["- No changes found."];
  const head = ["## Diagram changes", "", `${count} in \`${path.replace(/`/g, "'")}\`.`, "", ...items, ""].join("\n");
  const footer = "\n---\n_Proposed with PlantUML Ultimate._\n";

  let patch = createUnifiedPatch(path, leftSource, rightSource);
  let cut = "";
  const room = MAX_BODY - head.length - footer.length - 200;
  if (patch.length > room) {
    patch = patch.slice(0, Math.max(0, room));
    cut = "\n_The patch was cut to fit GitHub's limit; see the Files changed tab for the whole change._\n";
  }
  const fence = fenceFor(patch);
  return (
    [
      head,
      "<details><summary>Source patch</summary>",
      "",
      `${fence}diff`,
      patch.replace(/\n$/, ""),
      fence,
      "",
      "</details>",
      cut,
    ].join("\n") + footer
  );
}

/** `plantuml/<file>-<yyyymmdd>`, with the file name reduced to characters that are safe in a branch name. */
export function defaultProposalBranch(fileName: string, date = new Date()): string {
  const stem =
    fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "diagram";
  const day = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `plantuml/${stem}-${day}`;
}

export interface ProposeInput {
  source: string;
  /** The PR description. */
  body: string;
  commitMessage: string;
  /** Used only for a new pull request. */
  branch: string;
  title: string;
}

export interface ProposeResult {
  origin: GitHubOrigin;
  pullRequest: GitHubPullRequest;
  /** True when a commit was added to the tab's open pull request instead of opening a new one. */
  updated: boolean;
}

/**
 * The file changed on GitHub since the tab last saw it, so nothing was committed. `target` says which branch moved:
 * the base branch (a new proposal) or the proposal branch (adding a commit). `mergeUpstream` can try to combine
 * the tab's edits with the newer version.
 */
export class UpstreamChangedError extends GitHubError {
  constructor(
    readonly target: "base" | "proposal",
    readonly branch: string,
    message: string,
  ) {
    super("conflict", message, 409);
    this.name = "UpstreamChangedError";
  }
}

const upstreamChanged = (origin: GitHubOrigin) =>
  new UpstreamChangedError(
    "base",
    origin.ref,
    `${origin.path} changed on ${origin.ref} since you opened it, so it was not overwritten. Open the file from GitHub again to start from the latest version.`,
  );

async function fileOnBranch(client: GitHubClient, origin: GitHubOrigin, branch: string): Promise<boolean> {
  try {
    await client.getFile(origin.owner, origin.repo, branch, origin.path);
    return true;
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "not-found") return false;
    throw error;
  }
}

/** Whether proposing from this tab will add to its open pull request. */
export async function openProposal(client: GitHubClient, origin: GitHubOrigin): Promise<GitHubPullRequest | undefined> {
  if (!origin.proposal) return undefined;
  try {
    const pull = await client.getPullRequest(origin.owner, origin.repo, origin.proposal.number);
    return pull.state === "open" ? pull : undefined;
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "not-found") return undefined;
    throw error;
  }
}

/**
 * Proposes the tab's source as a pull request against the branch it was opened from:
 * a new branch from that branch's head, one commit (guarded by the opened blob SHA), and the pull request.
 * When the tab's earlier pull request is still open, the commit goes to its branch and the description is
 * updated instead.
 */
export async function proposeChange(
  client: GitHubClient,
  origin: GitHubOrigin,
  input: ProposeInput,
): Promise<ProposeResult> {
  const { owner, repo } = origin;
  const existing = await openProposal(client, origin);
  if (existing && origin.proposal) {
    let committed: { sha: string };
    try {
      committed = await client.putFile(owner, repo, {
        path: origin.path,
        branch: origin.proposal.branch,
        message: input.commitMessage,
        content: input.source,
        sha: origin.proposal.sha,
      });
    } catch (error) {
      if (error instanceof GitHubError && error.kind === "conflict")
        throw new UpstreamChangedError(
          "proposal",
          origin.proposal.branch,
          `${origin.path} changed on ${origin.proposal.branch} since your last proposal, so it was not overwritten.`,
        );
      throw error;
    }
    const pullRequest = await client.updatePullRequest(owner, repo, existing.number, input.body);
    return {
      origin: { ...origin, proposal: { ...origin.proposal, sha: committed.sha, htmlUrl: pullRequest.htmlUrl } },
      pullRequest,
      updated: true,
    };
  }

  // The earlier pull request added this file and is closed. If it was merged the file is on the base branch and
  // the opened blob still guards the commit; if it was closed unmerged the file is gone, so it is added again.
  let guard: string | undefined = origin.sha;
  if (origin.proposal?.newFile && !(await fileOnBranch(client, origin, origin.ref))) guard = undefined;

  let head: string;
  try {
    head = await client.getBranchHead(owner, repo, origin.ref);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "not-found")
      throw new GitHubError(
        "unsupported",
        `${origin.ref} is not a branch of ${owner}/${repo}. Changes can only be proposed for files opened from a branch.`,
      );
    throw error;
  }
  try {
    await client.createBranch(owner, repo, input.branch, head);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "invalid" && error.status === 422)
      throw new GitHubError("invalid", `A branch named ${input.branch} already exists. Choose another name.`, 422);
    throw error;
  }
  let committed: { sha: string };
  try {
    committed = await client.putFile(owner, repo, {
      path: origin.path,
      branch: input.branch,
      message: input.commitMessage,
      content: input.source,
      sha: guard,
    });
  } catch (error) {
    // Nothing was committed: remove the empty branch again, best effort.
    await client.deleteBranch(owner, repo, input.branch).catch(() => undefined);
    if (error instanceof GitHubError && error.kind === "conflict") throw upstreamChanged(origin);
    throw error;
  }
  const pullRequest = await client.createPullRequest(owner, repo, {
    title: input.title,
    head: input.branch,
    base: origin.ref,
    body: input.body,
  });
  return {
    origin: {
      ...origin,
      proposal: {
        branch: input.branch,
        number: pullRequest.number,
        htmlUrl: pullRequest.htmlUrl,
        sha: committed.sha,
        ...(origin.proposal?.newFile ? { newFile: true as const } : {}),
      },
    },
    pullRequest,
    updated: false,
  };
}
