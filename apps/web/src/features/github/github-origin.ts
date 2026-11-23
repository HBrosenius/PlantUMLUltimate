/**
 * Where a tab's source came from on GitHub. Plain, non-secret metadata (never the token): it lives on the
 * tab (recovery and workspace backups) so a later "Propose change" can find the file again. It is not part of
 * collaboration state, exported documents or snapshots.
 */
export interface GitHubOrigin {
  owner: string;
  repo: string;
  /** The branch (or tag or commit SHA) the file was opened from. */
  ref: string;
  /** Path of the file inside the repository, without a leading slash. */
  path: string;
  /** The file's blob SHA when it was opened; lets a later commit refuse to overwrite a newer file. */
  sha: string;
  /** Link to the file on github.com. */
  htmlUrl: string;
  /** The pull request proposed from this tab, so proposing again adds a commit to it. */
  proposal?: GitHubProposal;
}

export interface GitHubProposal {
  branch: string;
  number: number;
  /** Link to the pull request on github.com. */
  htmlUrl: string;
  /** The file's blob SHA on the proposal branch after the last commit. */
  sha: string;
}

function normalizeProposal(value: unknown): GitHubProposal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { branch, number, htmlUrl, sha } = value as Record<string, unknown>;
  if (!text(branch, 255) || !text(htmlUrl) || !text(sha, 64) || !safeGitHubUrl(htmlUrl)) return undefined;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return undefined;
  return { branch, number, htmlUrl, sha };
}

const text = (value: unknown, max = 2048): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/** Validates stored data; returns undefined for anything that is not a complete origin. */
export function normalizeGitHubOrigin(value: unknown): GitHubOrigin | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const { owner, repo, ref, path, sha, htmlUrl } = candidate;
  if (!text(owner, 100) || !text(repo, 100) || !text(ref, 255) || !text(path) || !text(sha, 64) || !text(htmlUrl))
    return undefined;
  if (!safeGitHubUrl(htmlUrl)) return undefined;
  const proposal = normalizeProposal(candidate.proposal);
  return { owner, repo, ref, path, sha, htmlUrl, ...(proposal ? { proposal } : {}) };
}

/** Only https links to github.com are shown as links, whatever a stored record says. */
export function safeGitHubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "github.com" || parsed.hostname === "www.github.com");
  } catch {
    return false;
  }
}

/** "GitHub · owner/repo · branch · path" */
export function describeGitHubOrigin(origin: GitHubOrigin): string {
  return `GitHub · ${origin.owner}/${origin.repo} · ${origin.ref} · ${origin.path}`;
}

/** The github.com link for a file at a ref. Segments are encoded; the ref keeps its slashes. */
export function gitHubFileUrl(owner: string, repo: string, ref: string, path: string): string {
  const encode = (value: string) => value.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encode(ref)}/${encode(path)}`;
}
