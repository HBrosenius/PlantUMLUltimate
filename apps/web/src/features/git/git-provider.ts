import type { GitOrigin } from "./git-origin";

/**
 * What the propose, upstream-merge and new-file flows and the dialogs need from a Git host. GitHub and GitLab
 * each implement it. Repositories are addressed as `owner` + `repo`: on GitHub the account or organization and
 * the repository; on GitLab the namespace (`group` or `group/subgroup`) and the project, so `owner/repo` is
 * the project's full path.
 */

export type GitProviderId = "github" | "gitlab";

export type GitProviderErrorKind =
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "not-found"
  | "network"
  | "too-large"
  | "unsupported"
  | "invalid-url"
  /** The file changed since it was opened (its version no longer matches). */
  | "conflict"
  /** The repository has no commits, so it has no branches yet. */
  | "empty-repository"
  /** The host refused the request, for example because a branch of that name already exists. */
  | "invalid"
  | "http";

/** An error whose message is safe and clear enough to show the user. It never contains the token. */
export class GitProviderError extends Error {
  constructor(
    readonly kind: GitProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GitProviderError";
  }
}

export interface GitProviderInfo {
  id: GitProviderId;
  /** "GitHub" or "GitLab", for messages. */
  name: string;
  /** "pull request" or "merge request". */
  reviewName: string;
  /** The web origin, for example `https://github.com`. */
  server: string;
}

export interface GitUser {
  login: string;
  name: string | undefined;
}

export interface GitRepository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  pushedAt: string | undefined;
  htmlUrl: string;
}

export interface GitEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "other";
  size: number;
}

export interface GitFile {
  name: string;
  path: string;
  size: number;
  content: string;
  /** The overwrite guard: GitHub's blob SHA, GitLab's last commit ID for the file. */
  version: string;
  /** The content's own ID, when it differs from `version` (GitLab's blob ID). */
  blob?: string;
}

export interface GitList<T> {
  items: T[];
  /** True when more existed than the pages the client reads. */
  truncated: boolean;
}

/** A pull request (`#12`) or merge request (`!12`). */
export interface GitReview {
  number: number;
  /** How the host writes it: `#12` or `!12`. */
  label: string;
  htmlUrl: string;
  state: "open" | "closed";
  merged: boolean;
}

/** A file version to read back: the guard `getFile` or `putFile` returned, plus the blob ID if there was one. */
export interface GitVersionRef {
  version: string;
  blob?: string | undefined;
  path: string;
}

export interface GitPutChange {
  path: string;
  /** Leave out to commit to the default branch (which creates it in an empty repository). */
  branch?: string | undefined;
  message: string;
  content: string;
  /** The version the change was made against; the host refuses to overwrite a newer file. Leave out to create. */
  version?: string | undefined;
}

/** A link to a file, parsed. The ref and the path run together in the link, because branch names can contain slashes. */
export interface GitFileLink {
  owner: string;
  repo: string;
  segments: string[];
}

export interface GitOpenedFile {
  file: GitFile;
  origin: GitOrigin;
}

export interface GitProvider {
  readonly info: GitProviderInfo;
  getUser(): Promise<GitUser>;
  listRepositories(): Promise<GitList<GitRepository>>;
  listBranches(owner: string, repo: string): Promise<GitList<string>>;
  listFolder(owner: string, repo: string, ref: string, path?: string): Promise<GitEntry[]>;
  getFile(owner: string, repo: string, ref: string, path: string): Promise<GitFile>;
  /** The exact text of an older version of a file, to recover what a tab was opened from or last proposed. */
  getVersionText(owner: string, repo: string, version: GitVersionRef): Promise<string>;
  /** The commit a branch points at. Fails with not-found for tags and commit IDs. */
  getBranchHead(owner: string, repo: string, branch: string): Promise<string>;
  createBranch(owner: string, repo: string, branch: string, fromHead: string): Promise<void>;
  deleteBranch(owner: string, repo: string, branch: string): Promise<void>;
  /** Commits one file. Returns the file's new version (the new guard). */
  putFile(owner: string, repo: string, change: GitPutChange): Promise<{ version: string }>;
  createReview(
    owner: string,
    repo: string,
    review: { title: string; head: string; base: string; body: string },
  ): Promise<GitReview>;
  getReview(owner: string, repo: string, number: number): Promise<GitReview>;
  updateReview(owner: string, repo: string, number: number, body: string): Promise<GitReview>;
  parseFileUrl(input: string): GitFileLink | undefined;
  fileUrl(owner: string, repo: string, ref: string, path: string): string;
  /** Opens a file from a pasted link, resolving the ref/path split against the host. */
  openFileFromUrl(input: string | GitFileLink): Promise<GitOpenedFile>;
}

export const PLANTUML_EXTENSIONS = [".puml", ".plantuml", ".pu", ".iuml", ".wsd"] as const;

export function isPlantUmlFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return PLANTUML_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Largest file the app opens from a Git host. */
export const MAX_GIT_FILE_BYTES = 1_000_000;
/** At most this many pages of repositories or branches are read (1,000 entries). */
export const MAX_GIT_PAGES = 10;

/**
 * The ways to split `segments` into a ref and a file path, longest ref first (a branch `feature/x` wins over
 * `feature` when both could match), keeping at least one segment for the path. A 40-character hex first
 * segment is tried first as a commit.
 */
export function refPathCandidates(segments: string[]): Array<{ ref: string; path: string }> {
  const candidates: Array<{ ref: string; path: string }> = [];
  for (let split = segments.length - 1; split >= 1; split--)
    candidates.push({ ref: segments.slice(0, split).join("/"), path: segments.slice(split).join("/") });
  const sha = candidates.findIndex((candidate) => /^[0-9a-f]{40}$/i.test(candidate.ref));
  if (sha > 0) candidates.unshift(...candidates.splice(sha, 1));
  return candidates;
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

export function decodeUtf8Bytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function decodeBase64Utf8(content: string): string {
  return decodeUtf8Bytes(Uint8Array.from(atob(content.replace(/\s/g, "")), (character) => character.charCodeAt(0)));
}
