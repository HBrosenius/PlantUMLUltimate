import { GitHubError, isPlantUmlFileName, type GitHubClient, type GitHubPullRequest } from "./github-client";
import { gitHubFileUrl, type GitHubOrigin } from "./github-origin";
import { fenceFor } from "./github-propose";

/** GitHub refuses pull request bodies over 65,536 characters; stay well below. */
const MAX_BODY = 60_000;

/** The tab's file name with a PlantUML extension: `flow.puml` stays, `notes.txt` becomes `notes.puml`. */
export function defaultNewFilePath(fileName: string): string {
  const name = fileName.replace(/[\\/]/g, " ").trim();
  if (!name) return "diagram.puml";
  if (isPlantUmlFileName(name)) return name;
  return `${name.replace(/\.[^.\s]+$/, "") || "diagram"}.puml`;
}

/** What is wrong with a file path inside a repository, in words for the user; undefined when it is fine. */
export function validateNewFilePath(path: string): string | undefined {
  if (!path) return "Enter a file path, for example docs/flow.puml.";
  if (path.startsWith("/")) return "Use a path inside the repository: remove the slash at the start.";
  if (path.includes("\\")) return "Use / between folders, not \\.";
  if (path.endsWith("/")) return "The path must end with a file name, for example docs/flow.puml.";
  const segments = path.split("/");
  if (segments.some((segment) => segment === "")) return "The path has an empty folder name (two slashes in a row).";
  if (segments.some((segment) => segment === "." || segment === ".."))
    return "The path cannot contain . or .. folders.";
  if ([...path].some((character) => character.charCodeAt(0) < 32 || character === "\u007f"))
    return "The path contains characters GitHub does not allow.";
  if (!isPlantUmlFileName(path))
    return "The file name must end in a PlantUML extension: .puml, .plantuml, .pu, .iuml or .wsd.";
  return undefined;
}

/**
 * The pull request description for a new file. A semantic review against an empty file only lists everything as
 * added, so this says that the file is new and keeps the whole source in a collapsed block.
 */
export function createNewFileMarkdown(path: string, source: string): string {
  const lines = source.length === 0 ? 0 : source.replace(/\r?\n$/, "").split(/\r?\n/).length;
  const head = [
    "## New diagram file",
    "",
    `Adds \`${path.replace(/`/g, "'")}\` (${lines} line${lines === 1 ? "" : "s"}).`,
    "",
  ].join("\n");
  const footer = "\n---\n_Proposed with PlantUML Ultimate._\n";
  let text = source.replace(/\r\n/g, "\n").replace(/\n$/, "");
  let cut = "";
  const room = MAX_BODY - head.length - footer.length - 200;
  if (text.length > room) {
    text = text.slice(0, Math.max(0, room));
    cut = "\n_The source was cut to fit GitHub's limit; see the Files changed tab for the whole file._\n";
  }
  const fence = fenceFor(text);
  return (
    [head, "<details><summary>Source</summary>", "", `${fence}plantuml`, text, fence, "", "</details>", cut].join(
      "\n",
    ) + footer
  );
}

export interface ProposeNewFileInput {
  owner: string;
  repo: string;
  /** The branch the pull request goes into. */
  base: string;
  path: string;
  source: string;
  /** The PR description. */
  body: string;
  commitMessage: string;
  branch: string;
  title: string;
}

export interface ProposeNewFileResult {
  /** The tab's link to GitHub: the file on the new branch, with the pull request as its proposal. */
  origin: GitHubOrigin;
  pullRequest: GitHubPullRequest;
}

/**
 * Puts a diagram that is not on GitHub yet into a repository as a pull request: checks the path is free on the
 * base branch, branches from its head, commits the file (no blob SHA, since there is none) and opens the pull
 * request. If anything fails once the branch exists, the branch is removed again.
 */
export async function proposeNewFile(client: GitHubClient, input: ProposeNewFileInput): Promise<ProposeNewFileResult> {
  const { owner, repo, base, path, branch } = input;
  const problem = validateNewFilePath(path);
  if (problem) throw new GitHubError("invalid", problem);

  let exists = true;
  try {
    await client.getFile(owner, repo, base, path);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "not-found") exists = false;
    // A folder, link or oversized file at that path is occupied as well.
    else if (!(error instanceof GitHubError && (error.kind === "unsupported" || error.kind === "too-large")))
      throw error;
  }
  if (exists)
    throw new GitHubError(
      "invalid",
      `${path} already exists on ${base} in ${owner}/${repo}. To change it, use Open from GitHub, edit the file and choose Propose change. Or choose another file path.`,
    );

  let head: string;
  try {
    head = await client.getBranchHead(owner, repo, base);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "not-found")
      throw new GitHubError("unsupported", `${base} is not a branch of ${owner}/${repo}. Choose one of its branches.`);
    throw error;
  }
  try {
    await client.createBranch(owner, repo, branch, head);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === "invalid" && error.status === 422)
      throw new GitHubError("invalid", `A branch named ${branch} already exists. Choose another name.`, 422);
    throw error;
  }
  try {
    const committed = await client.putFile(owner, repo, {
      path,
      branch,
      message: input.commitMessage,
      content: input.source,
    });
    const pullRequest = await client.createPullRequest(owner, repo, {
      title: input.title,
      head: branch,
      base,
      body: input.body,
    });
    return {
      origin: {
        owner,
        repo,
        ref: base,
        path,
        sha: committed.sha,
        htmlUrl: gitHubFileUrl(owner, repo, branch, path),
        proposal: {
          branch,
          number: pullRequest.number,
          htmlUrl: pullRequest.htmlUrl,
          sha: committed.sha,
          newFile: true,
        },
      },
      pullRequest,
    };
  } catch (error) {
    // Nothing usable was proposed: remove the branch again, best effort.
    await client.deleteBranch(owner, repo, branch).catch(() => undefined);
    throw error;
  }
}

export interface AddFirstFileInput {
  owner: string;
  repo: string;
  /** The repository's default branch, which the first commit creates. */
  defaultBranch: string;
  path: string;
  source: string;
  commitMessage: string;
}

/**
 * An empty repository has no branch a pull request could go into, so the diagram becomes its first commit on
 * the default branch. The tab is then linked to that file; later changes are proposed as pull requests as usual.
 */
export async function addFirstFile(client: GitHubClient, input: AddFirstFileInput): Promise<GitHubOrigin> {
  const { owner, repo, defaultBranch, path } = input;
  const problem = validateNewFilePath(path);
  if (problem) throw new GitHubError("invalid", problem);
  const committed = await client.putFile(owner, repo, {
    path,
    message: input.commitMessage,
    content: input.source,
  });
  return {
    owner,
    repo,
    ref: defaultBranch,
    path,
    sha: committed.sha,
    htmlUrl: gitHubFileUrl(owner, repo, defaultBranch, path),
  };
}
