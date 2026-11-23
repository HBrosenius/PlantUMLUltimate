import type { GitProviderId, GitProviderInfo } from "./git-provider";

export const GITHUB_SERVER = "https://github.com";

/**
 * Where a tab's source came from on a Git host. Plain, non-secret metadata (never the token): it lives on the
 * tab (recovery and workspace backups) so a later "Propose change" can find the file again. It is not part of
 * collaboration state, exported documents or snapshots.
 *
 * Records saved before GitLab support have no `provider` and no `server`, and keep the overwrite guard in `sha`.
 * They read as GitHub, and GitHub origins are still written that way, so stored data and the GitHub flows stay
 * as they were. A GitLab origin has `provider: "gitlab"`, its `server`, and the guard in `version`. Read and
 * change the guard with `originVersion` and `withOriginVersion`, not with the field names.
 */
export interface GitOrigin {
  /** Absent means GitHub. */
  provider?: GitProviderId;
  /** The https web origin of the host, for example `https://gitlab.example.com`. Absent means https://github.com. */
  server?: string;
  /** The account or organization (GitHub), or the namespace `group/subgroup` (GitLab). */
  owner: string;
  repo: string;
  /** The branch (or tag or commit ID) the file was opened from. */
  ref: string;
  /** Path of the file inside the repository, without a leading slash. */
  path: string;
  /** GitHub: the file's blob SHA when it was opened (the overwrite guard). */
  sha?: string;
  /** Provider-neutral overwrite guard. GitLab: the last commit ID that touched the file when it was opened. */
  version?: string;
  /** The opened content's own ID, to read the opened version back where it differs from the guard (GitLab). */
  blob?: string;
  /** Link to the file on the host. */
  htmlUrl: string;
  /** The pull or merge request proposed from this tab, so proposing again adds a commit to it. */
  proposal?: GitProposal;
}

export interface GitProposal {
  branch: string;
  number: number;
  /** Link to the pull or merge request on the host. */
  htmlUrl: string;
  /** The file's guard on the proposal branch after the last commit: `sha` on GitHub, `version` on GitLab. */
  sha?: string;
  version?: string;
  /** The request adds the file, so the file may not exist on the base branch (it was closed). */
  newFile?: true;
}

/** The GitHub-era names. A GitHub origin is a `GitOrigin` without a provider. */
export type GitHubOrigin = GitOrigin;
export type GitHubProposal = GitProposal;

export const originProvider = (origin: Pick<GitOrigin, "provider">): GitProviderId => origin.provider ?? "github";
export const originServer = (origin: Pick<GitOrigin, "provider" | "server">): string => origin.server ?? GITHUB_SERVER;

/** The overwrite guard of the file as opened (or as last merged). */
export const originVersion = (origin: GitOrigin): string | undefined => origin.version ?? origin.sha;
/** The guard of the file on the proposal branch. */
export const proposalVersion = (proposal: GitProposal): string | undefined => proposal.version ?? proposal.sha;

function guardFields(provider: GitProviderId, version: string): { sha: string } | { version: string } {
  return provider === "github" ? { sha: version } : { version };
}

/** The origin with a new guard (and blob, when the provider has one). GitHub keeps its stored field name. */
export function withOriginVersion(origin: GitOrigin, version: string, blob?: string): GitOrigin {
  const next: GitOrigin = { ...origin, ...guardFields(originProvider(origin), version) };
  if (originProvider(origin) === "github") delete next.version;
  else delete next.sha;
  if (blob) next.blob = blob;
  else delete next.blob;
  return next;
}

export function withProposalVersion(
  provider: GitProviderId,
  proposal: GitProposal,
  version: string,
  htmlUrl?: string,
): GitProposal {
  const next: GitProposal = { ...proposal, ...guardFields(provider, version), ...(htmlUrl ? { htmlUrl } : {}) };
  if (provider === "github") delete next.version;
  else delete next.sha;
  return next;
}

/** A new origin for a file on `provider`. A GitHub origin carries neither `provider` nor `server`, as before. */
export function createOrigin(
  provider: Pick<GitProviderInfo, "id" | "server">,
  fields: {
    owner: string;
    repo: string;
    ref: string;
    path: string;
    version: string;
    blob?: string | undefined;
    htmlUrl: string;
    proposal?: GitProposal;
  },
): GitOrigin {
  const { version, blob, proposal, ...rest } = fields;
  return {
    ...(provider.id === "github" ? {} : { provider: provider.id, server: provider.server }),
    ...rest,
    ...guardFields(provider.id, version),
    ...(blob ? { blob } : {}),
    ...(proposal ? { proposal } : {}),
  };
}

export function createProposal(
  provider: Pick<GitProviderInfo, "id">,
  fields: { branch: string; number: number; htmlUrl: string; version: string; newFile?: true },
): GitProposal {
  const { version, ...rest } = fields;
  return { ...rest, ...guardFields(provider.id, version) };
}

const text = (value: unknown, max = 2048): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

/**
 * A server address reduced to its origin, or undefined unless it is a plain `https` address (no user name,
 * password, path, query or fragment). Self-managed servers under a path are not supported.
 */
export function normalizeServer(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
  if (url.pathname !== "/" && url.pathname !== "") return undefined;
  if (!url.hostname) return undefined;
  return url.origin;
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

/** Whether `url` is an https link on `server` (an https origin). GitHub's own `www.` host counts as github.com. */
export function isLinkOnServer(server: string, url: string): boolean {
  if (server === GITHUB_SERVER) return safeGitHubUrl(url);
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.origin === server;
  } catch {
    return false;
  }
}

/** Origin links are shown only when they point to the origin's own server over https. */
export function isSafeOriginLink(origin: GitOrigin | Pick<GitOrigin, "provider" | "server">, url: string): boolean {
  return isLinkOnServer(originServer(origin), url);
}

function normalizeProposal(value: unknown, provider: GitProviderId, server: string): GitProposal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { branch, number, htmlUrl, sha, version, newFile } = value as Record<string, unknown>;
  const guard = provider === "github" ? (sha ?? version) : version;
  if (!text(branch, 255) || !text(htmlUrl) || !text(guard, 64) || !isLinkOnServer(server, htmlUrl)) return undefined;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) return undefined;
  return { branch, number, htmlUrl, ...guardFields(provider, guard), ...(newFile === true ? { newFile } : {}) };
}

/** Validates stored data; returns undefined for anything that is not a complete origin. Records without a provider read as GitHub. */
export function normalizeGitOrigin(value: unknown): GitOrigin | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const provider = candidate.provider === undefined ? "github" : candidate.provider;
  if (provider !== "github" && provider !== "gitlab") return undefined;
  const { owner, repo, ref, path, htmlUrl } = candidate;
  const limit = provider === "github" ? 100 : 255;
  if (!text(owner, limit) || !text(repo, limit) || !text(ref, 255) || !text(path) || !text(htmlUrl)) return undefined;

  let server = GITHUB_SERVER;
  if (provider === "gitlab") {
    const normalized = typeof candidate.server === "string" ? normalizeServer(candidate.server) : undefined;
    if (!normalized || normalized !== candidate.server) return undefined;
    server = normalized;
  } else if (candidate.server !== undefined && candidate.server !== GITHUB_SERVER) {
    return undefined;
  }
  const guard = provider === "github" ? (candidate.sha ?? candidate.version) : candidate.version;
  if (!text(guard, 64) || !isLinkOnServer(server, htmlUrl)) return undefined;
  const blob = text(candidate.blob, 64) ? candidate.blob : undefined;
  const proposal = normalizeProposal(candidate.proposal, provider, server);
  return {
    ...(provider === "gitlab" ? { provider, server } : {}),
    owner,
    repo,
    ref,
    path,
    ...guardFields(provider, guard),
    ...(blob ? { blob } : {}),
    htmlUrl,
    ...(proposal ? { proposal } : {}),
  };
}

/** The GitHub-era name; reads records saved before GitLab support. */
export const normalizeGitHubOrigin = normalizeGitOrigin;

/** "GitHub · owner/repo · branch · path" or "GitLab · group/project · branch · path" */
export function describeGitOrigin(origin: GitOrigin): string {
  const name = originProvider(origin) === "gitlab" ? "GitLab" : "GitHub";
  return `${name} · ${origin.owner}/${origin.repo} · ${origin.ref} · ${origin.path}`;
}
export const describeGitHubOrigin = describeGitOrigin;

/** The github.com link for a file at a ref. Segments are encoded; the ref keeps its slashes. */
export function gitHubFileUrl(owner: string, repo: string, ref: string, path: string): string {
  const encode = (value: string) => value.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${encode(ref)}/${encode(path)}`;
}
