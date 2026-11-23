export { refPathCandidates } from "../git/git-provider";

export interface ParsedGitHubFileUrl {
  owner: string;
  repo: string;
  /**
   * Everything after `/blob/` (or the raw host's repository): the ref and the path run together, because branch
   * names may contain slashes. Resolve it with `GitHubClient.openFileFromUrl`.
   */
  segments: string[];
}

/**
 * Parses a link to a file on GitHub: `https://github.com/owner/repo/blob/<ref>/<path>` (also `/raw/`, and with
 * `?plain=1` or a `#L10` fragment), or `https://raw.githubusercontent.com/owner/repo/<ref>/<path>`.
 * Returns undefined for anything else, including folder (`/tree/`) links and other hosts.
 */
export function parseGitHubFileUrl(input: string): ParsedGitHubFileUrl | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  let parts: string[];
  try {
    parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  let owner: string | undefined;
  let repo: string | undefined;
  let rest: string[];
  if (host === "github.com" || host === "www.github.com") {
    if (parts.length < 5 || (parts[2] !== "blob" && parts[2] !== "raw")) return undefined;
    [owner, repo] = parts;
    rest = parts.slice(3);
  } else if (host === "raw.githubusercontent.com") {
    if (parts.length < 4) return undefined;
    [owner, repo] = parts;
    rest = parts.slice(2);
    // raw.githubusercontent.com/o/r/refs/heads/main/path
    if (rest[0] === "refs" && (rest[1] === "heads" || rest[1] === "tags") && rest.length > 3) rest = rest.slice(2);
  } else {
    return undefined;
  }
  if (!owner || !repo || rest.length < 2) return undefined;
  return { owner, repo: repo.replace(/\.git$/, ""), segments: rest };
}
