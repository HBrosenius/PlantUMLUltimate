import { gitHubFileUrl, type GitHubOrigin } from "./github-origin";
import { parseGitHubFileUrl, refPathCandidates, type ParsedGitHubFileUrl } from "./github-url";

const API_BASE = "https://api.github.com";
const PAGE_SIZE = 100;
/** Largest file the app opens. GitHub's Contents API returns file content inline only up to 1 MB anyway. */
export const MAX_GITHUB_FILE_BYTES = 1_000_000;
/** At most this many pages of repositories or branches are read (1,000 entries). */
const MAX_PAGES = 10;

export type GitHubErrorKind =
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "not-found"
  | "network"
  | "too-large"
  | "unsupported"
  | "invalid-url"
  /** 409: the file changed since it was opened (its blob SHA no longer matches). */
  | "conflict"
  /** 409 from the Git API: the repository has no commits, so it has no branches yet. */
  | "empty-repository"
  /** 422: GitHub refused the request, for example because a branch of that name already exists. */
  | "invalid"
  | "http";

/** An error whose message is safe and clear enough to show the user. It never contains the token. */
export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubUser {
  login: string;
  name: string | undefined;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  pushedAt: string | undefined;
  htmlUrl: string;
}

export interface GitHubEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "other";
  size: number;
}

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  content: string;
}

export interface GitHubList<T> {
  items: T[];
  /** True when more existed than the pages this client reads. */
  truncated: boolean;
}

export interface GitHubClientOptions {
  token: string;
  /** Injected so tests never call GitHub. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

type Json = Record<string, unknown>;

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

function encodePath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  // URL parsing resolves "." and ".." even when encoded, so a crafted link could otherwise send the token's
  // request to another api.github.com endpoint. File paths in a repository never need them.
  if (segments.some((segment) => segment === "." || segment === ".."))
    throw new GitHubError("unsupported", `${path} is not a file path in a repository.`);
  return segments.map(encodeURIComponent).join("/");
}

function describeWait(response: Response): string {
  const retryAfter = Number(response.headers.get("retry-after"));
  let seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (seconds === undefined && Number.isFinite(reset) && reset > 0) seconds = Math.max(0, reset - Date.now() / 1000);
  if (seconds === undefined) return "Try again in a few minutes.";
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "Try again in about a minute." : `Try again in about ${minutes} minutes.`;
}

async function failure(response: Response, what: string, write = false): Promise<GitHubError> {
  const { status } = response;
  if (status === 401)
    return new GitHubError(
      "unauthorized",
      "GitHub rejected the token: it is invalid, expired or revoked. Create a new token and paste it in Settings → GitHub.",
      status,
    );
  if (
    status === 429 ||
    (status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))
  )
    return new GitHubError("rate-limited", `GitHub's rate limit was reached. ${describeWait(response)}`, status);
  if (status === 403) {
    let detail = "";
    try {
      const body = (await response.json()) as Json;
      detail = asString(body.message) ?? "";
    } catch {
      /* no body */
    }
    if (/rate limit|abuse|secondary/i.test(detail))
      return new GitHubError("rate-limited", `GitHub's rate limit was reached. ${describeWait(response)}`, status);
    if (write)
      return new GitHubError(
        "forbidden",
        `The token cannot change ${what}. Proposing a change needs Repository permissions: Contents and Pull requests (read and write) for that repository, and push access to it. You can still save the file locally.`,
        status,
      );
    return new GitHubError(
      "forbidden",
      `The token has no access to ${what}. It needs Repository permissions: Contents (read) for that repository.`,
      status,
    );
  }
  if (status === 404)
    return new GitHubError(
      "not-found",
      `${what[0]!.toUpperCase()}${what.slice(1)} was not found, or the token cannot see it. Fine-grained tokens only reach the repositories selected when the token was created.`,
      status,
    );
  if (status === 409) {
    let detail = "";
    try {
      detail = asString(((await response.json()) as Json).message) ?? "";
    } catch {
      /* no body */
    }
    if (/repository is empty/i.test(detail))
      return new GitHubError(
        "empty-repository",
        "The repository is empty: it has no commits yet, so it has no branch a pull request could go into.",
        status,
      );
    return new GitHubError("conflict", `${what[0]!.toUpperCase()}${what.slice(1)} changed on GitHub.`, status);
  }
  if (status === 422) {
    let detail = "";
    try {
      const body = (await response.json()) as Json;
      const first = Array.isArray(body.errors) ? (body.errors[0] as Json | undefined) : undefined;
      detail = asString(first?.message) ?? asString(body.message) ?? "";
    } catch {
      /* no body */
    }
    return new GitHubError(
      "invalid",
      `GitHub refused the change to ${what}${detail ? `: ${detail.slice(0, 200)}` : "."}`,
      status,
    );
  }
  return new GitHubError("http", `GitHub returned an unexpected error (HTTP ${status}) for ${what}.`, status);
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

export interface GitHubPullRequest {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
  merged: boolean;
}

function decodeBase64Utf8(content: string): string {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function createGitHubClient({ token, fetch: injected }: GitHubClientOptions) {
  const doFetch: typeof fetch = injected ?? ((input, init) => globalThis.fetch(input, init));

  async function request(method: string, path: string, what: string, body?: Json): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new GitHubError(
        "network",
        "Could not reach api.github.com. Check your connection, or whether a content blocker or network policy is stopping the request.",
      );
    }
    if (!response.ok) throw await failure(response, what, method !== "GET");
    return response;
  }

  async function json<T>(
    path: string,
    what: string,
    method = "GET",
    body?: Json,
  ): Promise<{ data: T; response: Response }> {
    const response = await request(method, path, what, body);
    try {
      return { data: (await response.json()) as T, response };
    } catch {
      throw new GitHubError("http", `GitHub sent an answer for ${what} that could not be read.`, response.status);
    }
  }

  async function paginate<T>(path: string, what: string, map: (item: Json) => T | undefined): Promise<GitHubList<T>> {
    const items: T[] = [];
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, response } = await json<Json[]>(`${path}${separator}per_page=${PAGE_SIZE}&page=${page}`, what);
      if (!Array.isArray(data)) break;
      for (const raw of data) {
        const item = map(raw);
        if (item !== undefined) items.push(item);
      }
      const more =
        /rel="next"/.test(response.headers.get("link") ?? "") ||
        (response.headers.get("link") === null && data.length === PAGE_SIZE);
      if (!more) return { items, truncated: false };
      if (page === MAX_PAGES) return { items, truncated: true };
    }
    return { items, truncated: false };
  }

  const repositoryBase = (owner: string, repo: string) =>
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  function toEntry(raw: Json): GitHubEntry | undefined {
    const name = asString(raw.name);
    const path = asString(raw.path);
    if (!name || path === undefined) return undefined;
    const type = raw.type === "file" ? "file" : raw.type === "dir" ? "dir" : "other";
    return { name, path, type, size: typeof raw.size === "number" ? raw.size : 0 };
  }

  async function getFile(owner: string, repo: string, ref: string, path: string): Promise<GitHubFile> {
    const what = `${path} in ${owner}/${repo} at ${ref}`;
    const { data } = await json<Json | Json[]>(
      `${repositoryBase(owner, repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      what,
    );
    if (Array.isArray(data) || data.type !== "file")
      throw new GitHubError("unsupported", `${path} is a folder or a link, not a file that can be opened.`);
    const size = typeof data.size === "number" ? data.size : 0;
    if (size > MAX_GITHUB_FILE_BYTES)
      throw new GitHubError(
        "too-large",
        `${path} is ${(size / 1_000_000).toFixed(1)} MB. Files over 1 MB are not opened from GitHub.`,
      );
    const content = asString(data.content);
    const sha = asString(data.sha);
    if (content === undefined || data.encoding !== "base64" || !sha)
      throw new GitHubError("unsupported", `GitHub did not return the content of ${path}.`);
    let text: string;
    try {
      text = decodeBase64Utf8(content);
    } catch {
      throw new GitHubError("unsupported", `${path} is not UTF-8 text, so it cannot be opened as a diagram.`);
    }
    return {
      name: asString(data.name) ?? path.split("/").pop() ?? path,
      path: asString(data.path) ?? path,
      sha,
      size,
      content: text,
    };
  }

  const branchRef = (branch: string) => {
    if (!branch || /(^|\/)\.\.?(\/|$)|\.\.|[\s~^:?*[\\]|@\{|^\/|\/$|\.lock(\/|$)/.test(branch))
      throw new GitHubError("invalid", `"${branch}" is not a valid branch name.`);
    return branch.split("/").map(encodeURIComponent).join("/");
  };

  function toPullRequest(raw: Json): GitHubPullRequest {
    const number = typeof raw.number === "number" ? raw.number : undefined;
    const htmlUrl = asString(raw.html_url);
    if (number === undefined || !htmlUrl) throw new GitHubError("http", "GitHub did not describe the pull request.");
    return { number, htmlUrl, state: raw.state === "open" ? "open" : "closed", merged: raw.merged === true };
  }

  return {
    /** The exact text of a blob, used to recover the version a tab was opened from. */
    async getBlobText(owner: string, repo: string, sha: string): Promise<string> {
      if (!SHA.test(sha)) throw new GitHubError("unsupported", "The file's GitHub version is not a valid SHA.");
      const { data } = await json<Json>(
        `${repositoryBase(owner, repo)}/git/blobs/${sha}`,
        `the opened version of the file in ${owner}/${repo}`,
      );
      const content = asString(data.content);
      if (content === undefined || data.encoding !== "base64")
        throw new GitHubError("unsupported", "GitHub did not return the opened version of the file.");
      try {
        return decodeBase64Utf8(content);
      } catch {
        throw new GitHubError("unsupported", "The opened version of the file is not UTF-8 text.");
      }
    },

    /** The commit SHA a branch points at. Fails with not-found for tags and commit SHAs. */
    async getBranchHead(owner: string, repo: string, branch: string): Promise<string> {
      const { data } = await json<Json>(
        `${repositoryBase(owner, repo)}/git/ref/heads/${branchRef(branch)}`,
        `branch ${branch} in ${owner}/${repo}`,
      );
      const sha = asString((data.object as Json | undefined)?.sha);
      if (Array.isArray(data) || !sha || !SHA.test(sha))
        throw new GitHubError("not-found", `${branch} is not a branch in ${owner}/${repo}.`, 404);
      return sha;
    },

    async createBranch(owner: string, repo: string, branch: string, fromSha: string): Promise<void> {
      branchRef(branch);
      if (!SHA.test(fromSha)) throw new GitHubError("unsupported", "The base commit is not a valid SHA.");
      await request("POST", `${repositoryBase(owner, repo)}/git/refs`, `branch ${branch} in ${owner}/${repo}`, {
        ref: `refs/heads/${branch}`,
        sha: fromSha,
      });
    },

    async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
      await request(
        "DELETE",
        `${repositoryBase(owner, repo)}/git/refs/heads/${branchRef(branch)}`,
        `branch ${branch} in ${owner}/${repo}`,
      );
    },

    /**
     * Commits one file on a branch. `sha` is the blob the change was made against, so GitHub refuses (409) to
     * overwrite a file that changed in the meantime. Leave `sha` out to create a file that does not exist yet.
     * Returns the new blob SHA.
     */
    async putFile(
      owner: string,
      repo: string,
      change: { path: string; branch?: string | undefined; message: string; content: string; sha?: string | undefined },
    ): Promise<{ sha: string }> {
      // Without a branch GitHub commits to the default branch; in an empty repository that creates it.
      if (change.branch !== undefined) branchRef(change.branch);
      const { data } = await json<Json>(
        `${repositoryBase(owner, repo)}/contents/${encodePath(change.path)}`,
        `${change.path} in ${owner}/${repo}`,
        "PUT",
        {
          message: change.message,
          content: encodeBase64Utf8(change.content),
          ...(change.sha ? { sha: change.sha } : {}),
          ...(change.branch !== undefined ? { branch: change.branch } : {}),
        },
      );
      const sha = asString((data.content as Json | undefined)?.sha);
      if (!sha) throw new GitHubError("http", "GitHub did not confirm the commit.");
      return { sha };
    },

    async createPullRequest(
      owner: string,
      repo: string,
      pull: { title: string; head: string; base: string; body: string },
    ): Promise<GitHubPullRequest> {
      const { data } = await json<Json>(
        `${repositoryBase(owner, repo)}/pulls`,
        `a pull request in ${owner}/${repo}`,
        "POST",
        pull,
      );
      return toPullRequest(data);
    },

    async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
      const { data } = await json<Json>(
        `${repositoryBase(owner, repo)}/pulls/${Math.trunc(number)}`,
        `pull request #${number} in ${owner}/${repo}`,
      );
      return toPullRequest(data);
    },

    async updatePullRequest(owner: string, repo: string, number: number, body: string): Promise<GitHubPullRequest> {
      const { data } = await json<Json>(
        `${repositoryBase(owner, repo)}/pulls/${Math.trunc(number)}`,
        `pull request #${number} in ${owner}/${repo}`,
        "PATCH",
        { body },
      );
      return toPullRequest(data);
    },

    async getUser(): Promise<GitHubUser> {
      const { data } = await json<Json>("/user", "your GitHub account");
      const login = asString(data.login);
      if (!login) throw new GitHubError("http", "GitHub did not say who this token belongs to.");
      return { login, name: asString(data.name) };
    },

    /** Repositories the token can reach, most recently pushed first. */
    listRepositories(): Promise<GitHubList<GitHubRepository>> {
      return paginate(
        "/user/repos?sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member",
        "your repositories",
        (raw) => {
          const fullName = asString(raw.full_name);
          const owner = asString((raw.owner as Json | undefined)?.login);
          const name = asString(raw.name);
          if (!fullName || !owner || !name) return undefined;
          return {
            owner,
            name,
            fullName,
            defaultBranch: asString(raw.default_branch) ?? "main",
            private: raw.private === true,
            pushedAt: asString(raw.pushed_at),
            htmlUrl: asString(raw.html_url) ?? `https://github.com/${fullName}`,
          };
        },
      );
    },

    listBranches(owner: string, repo: string): Promise<GitHubList<string>> {
      return paginate(`${repositoryBase(owner, repo)}/branches`, `the branches of ${owner}/${repo}`, (raw) =>
        asString(raw.name),
      );
    },

    /** One folder's entries (lazy loading; the Contents API lists a single level). Folders first, then by name. */
    async listFolder(owner: string, repo: string, ref: string, path = ""): Promise<GitHubEntry[]> {
      const { data } = await json<Json[] | Json>(
        `${repositoryBase(owner, repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
        `${path || "the top folder"} in ${owner}/${repo} at ${ref}`,
      );
      if (!Array.isArray(data)) throw new GitHubError("unsupported", `${path} is a file, not a folder.`);
      return data
        .map(toEntry)
        .filter((entry): entry is GitHubEntry => entry !== undefined)
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    },

    getFile,

    /**
     * Opens a file from a pasted link. The ref and path run together in the link and branch names can contain
     * slashes, so the splits are tried longest ref first (`feature/x` before `feature`) until the API finds the
     * file. A 404 for one split just means it was the wrong split; any other failure stops at once.
     */
    async openFileFromUrl(input: string | ParsedGitHubFileUrl): Promise<{ file: GitHubFile; origin: GitHubOrigin }> {
      const parsed = typeof input === "string" ? parseGitHubFileUrl(input) : input;
      if (!parsed)
        throw new GitHubError(
          "invalid-url",
          "That is not a link to a file on GitHub. Use a link like https://github.com/owner/repo/blob/main/folder/diagram.puml.",
        );
      for (const { ref, path } of refPathCandidates(parsed.segments)) {
        try {
          const file = await getFile(parsed.owner, parsed.repo, ref, path);
          return {
            file,
            origin: {
              owner: parsed.owner,
              repo: parsed.repo,
              ref,
              path: file.path,
              sha: file.sha,
              htmlUrl: gitHubFileUrl(parsed.owner, parsed.repo, ref, file.path),
            },
          };
        } catch (error) {
          if (!(error instanceof GitHubError && error.kind === "not-found")) throw error;
        }
      }
      throw new GitHubError(
        "not-found",
        `That file was not found in ${parsed.owner}/${parsed.repo}, or the token cannot see the repository. Fine-grained tokens only reach the repositories selected when the token was created.`,
        404,
      );
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;

export const PLANTUML_EXTENSIONS = [".puml", ".plantuml", ".pu", ".iuml", ".wsd"] as const;

export function isPlantUmlFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return PLANTUML_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
