import type { ReviewGroup } from "../../semantic-review";
import { createUnifiedPatch } from "../../semantic-review";
import {
  createProposal,
  originProvider,
  originVersion,
  proposalVersion,
  withProposalVersion,
  type GitOrigin,
} from "./git-origin";
import { GitProviderError, type GitProvider, type GitReview } from "./git-provider";

/** GitHub refuses pull request bodies over 65,536 characters (GitLab allows more); stay well below. */
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
    cut = "\n_The patch was cut to fit the description limit; see the request's changes for the whole change._\n";
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
  origin: GitOrigin;
  /** The pull or merge request. */
  pullRequest: GitReview;
  /** True when a commit was added to the tab's open pull request instead of opening a new one. */
  updated: boolean;
}

/**
 * The file changed on the host since the tab last saw it, so nothing was committed. `target` says which branch moved:
 * the base branch (a new proposal) or the proposal branch (adding a commit). `mergeUpstream` can try to combine
 * the tab's edits with the newer version.
 */
export class UpstreamChangedError extends GitProviderError {
  constructor(
    readonly target: "base" | "proposal",
    readonly branch: string,
    message: string,
  ) {
    super("conflict", message, 409);
    this.name = "UpstreamChangedError";
  }
}

const upstreamChanged = (client: GitProvider, origin: GitOrigin) =>
  new UpstreamChangedError(
    "base",
    origin.ref,
    `${origin.path} changed on ${origin.ref} since you opened it, so it was not overwritten. Open the file from ${client.info.name} again to start from the latest version.`,
  );

async function fileOnBranch(client: GitProvider, origin: GitOrigin, branch: string): Promise<boolean> {
  try {
    await client.getFile(origin.owner, origin.repo, branch, origin.path);
    return true;
  } catch (error) {
    if (error instanceof GitProviderError && error.kind === "not-found") return false;
    throw error;
  }
}

/** Whether proposing from this tab will add to its open pull or merge request. */
export async function openProposal(client: GitProvider, origin: GitOrigin): Promise<GitReview | undefined> {
  if (!origin.proposal) return undefined;
  try {
    const pull = await client.getReview(origin.owner, origin.repo, origin.proposal.number);
    return pull.state === "open" ? pull : undefined;
  } catch (error) {
    if (error instanceof GitProviderError && error.kind === "not-found") return undefined;
    throw error;
  }
}

/**
 * Proposes the tab's source as a pull or merge request against the branch it was opened from:
 * a new branch from that branch's head, one commit (guarded by the opened version), and the request.
 * When the tab's earlier request is still open, the commit goes to its branch and the description is
 * updated instead.
 */
export async function proposeChange(
  client: GitProvider,
  origin: GitOrigin,
  input: ProposeInput,
): Promise<ProposeResult> {
  const { owner, repo } = origin;
  const existing = await openProposal(client, origin);
  if (existing && origin.proposal) {
    let committed: { version: string };
    try {
      committed = await client.putFile(owner, repo, {
        path: origin.path,
        branch: origin.proposal.branch,
        message: input.commitMessage,
        content: input.source,
        version: proposalVersion(origin.proposal),
      });
    } catch (error) {
      if (error instanceof GitProviderError && error.kind === "conflict")
        throw new UpstreamChangedError(
          "proposal",
          origin.proposal.branch,
          `${origin.path} changed on ${origin.proposal.branch} since your last proposal, so it was not overwritten.`,
        );
      throw error;
    }
    const pullRequest = await client.updateReview(owner, repo, existing.number, input.body);
    return {
      origin: {
        ...origin,
        proposal: withProposalVersion(originProvider(origin), origin.proposal, committed.version, pullRequest.htmlUrl),
      },
      pullRequest,
      updated: true,
    };
  }

  // The earlier request added this file and is closed. If it was merged the file is on the base branch and
  // the opened version still guards the commit; if it was closed unmerged the file is gone, so it is added again.
  let guard: string | undefined = originVersion(origin);
  if (origin.proposal?.newFile && !(await fileOnBranch(client, origin, origin.ref))) guard = undefined;

  let head: string;
  try {
    head = await client.getBranchHead(owner, repo, origin.ref);
  } catch (error) {
    if (error instanceof GitProviderError && error.kind === "not-found")
      throw new GitProviderError(
        "unsupported",
        `${origin.ref} is not a branch of ${owner}/${repo}. Changes can only be proposed for files opened from a branch.`,
      );
    throw error;
  }
  try {
    await client.createBranch(owner, repo, input.branch, head);
  } catch (error) {
    if (error instanceof GitProviderError && error.kind === "invalid" && (error.status === 422 || error.status === 400))
      throw new GitProviderError("invalid", `A branch named ${input.branch} already exists. Choose another name.`, 422);
    throw error;
  }
  let committed: { version: string };
  try {
    committed = await client.putFile(owner, repo, {
      path: origin.path,
      branch: input.branch,
      message: input.commitMessage,
      content: input.source,
      version: guard,
    });
  } catch (error) {
    // Nothing was committed: remove the empty branch again, best effort.
    await client.deleteBranch(owner, repo, input.branch).catch(() => undefined);
    if (error instanceof GitProviderError && error.kind === "conflict") throw upstreamChanged(client, origin);
    throw error;
  }
  const pullRequest = await client.createReview(owner, repo, {
    title: input.title,
    head: input.branch,
    base: origin.ref,
    body: input.body,
  });
  return {
    origin: {
      ...origin,
      proposal: createProposal(client.info, {
        branch: input.branch,
        number: pullRequest.number,
        htmlUrl: pullRequest.htmlUrl,
        version: committed.version,
        ...(origin.proposal?.newFile ? { newFile: true as const } : {}),
      }),
    },
    pullRequest,
    updated: false,
  };
}
