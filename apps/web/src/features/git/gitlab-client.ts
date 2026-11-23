import { createOrigin, normalizeServer } from "./git-origin";
import {
  decodeBase64Utf8,
  decodeUtf8Bytes,
  encodeBase64Utf8,
  GitProviderError,
  MAX_GIT_FILE_BYTES,
  MAX_GIT_PAGES,
  refPathCandidates,
  type GitEntry,
  type GitFile,
  type GitFileLink,
  type GitList,
  type GitOpenedFile,
  type GitProvider,
  type GitPutChange,
  type GitRepository,
  type GitReview,
  type GitUser,
  type GitVersionRef,
} from "./git-provider";

const PAGE_SIZE = 100;
const COMMIT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

export interface GitLabClientOptions {
  /** The web address of the GitLab server, `https` only (for example `https://gitlab.com`). Reduced to its origin. */
  server: string;
  /** A personal access token with the `api` scope, or a project access token. Only ever sent to `server`. */
  token: string;
  /** Injected so tests never call GitLab. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

type Json = Record<string, unknown>;

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const upperFirst = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`;

/**
 * Whether GitLab's refusal of a commit says the file changed since the guard (`last_commit_id`) was read.
 *
 * ASSUMPTION, not yet checked against a real server (plan slice L0): GitLab answers a commit whose
 * `last_commit_id` is outdated with HTTP 400 (possibly 409) and a message along the lines of "You are
 * attempting to update a file that has changed since you started editing it" or "The file has been modified
 * since the last commit was fetched". The match is deliberately loose and lives only here, so a different
 * wording on a real server is a one-line change.
 */
export function isStaleGuardMessage(message: string): boolean {
  return (
    /\b(changed|modified|updated)\b[^.]{0,80}\bsince\b/i.test(message) ||
    /\bsince\b[^.]{0,80}\b(started editing|last commit|last_commit_id)\b/i.test(message) ||
    /\blast_commit_id\b/i.test(message)
  );
}

/** The text of an error body: GitLab uses `{message: "…"}`, `{message: {field: ["…"]}}` or `{error: "…"}`. */
function detailOf(body: unknown): string {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.map(detailOf).filter(Boolean).join("; ");
  if (body && typeof body === "object") {
    const { message, error, error_description: description } = body as Json;
    const parts = [message, error, description].map((part) => (part === undefined ? "" : detailOf(part)));
    if (!parts.some(Boolean))
      return Object.values(body as Json)
        .map(detailOf)
        .filter(Boolean)
        .join("; ");
    return parts.filter(Boolean).join("; ");
  }
  return "";
}

function describeWait(response: Response): string {
  const retryAfter = Number(response.headers.get("retry-after"));
  let seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  const reset = Number(response.headers.get("ratelimit-reset"));
  if (seconds === undefined && Number.isFinite(reset) && reset > 0) seconds = Math.max(0, reset - Date.now() / 1000);
  if (seconds === undefined) return "Try again in a few minutes.";
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "Try again in about a minute." : `Try again in about ${minutes} minutes.`;
}

/** A path inside a project or a project path, split into segments that cannot climb out of the API route. */
function checkedSegments(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  // URL parsing resolves "." and ".." even when encoded, so a crafted link could otherwise send the token's
  // request to another endpoint on the server.
  if (!segments.length || segments.some((segment) => segment === "." || segment === ".."))
    throw new GitProviderError("unsupported", `${path} is not a path in a project.`);
  return segments;
}

const BAD_BRANCH = /(^|\/)\.\.?(\/|$)|\.\.|[\s~^:?*[\\]|@\{|^\/|\/$|\.lock(\/|$)/;

export function createGitLabClient(options: GitLabClientOptions): GitProvider {
  const server = normalizeServer(options.server);
  if (!server)
    throw new GitProviderError(
      "invalid",
      "The GitLab server address must be an https address such as https://gitlab.com, with no path.",
    );
  const { token } = options;
  const apiBase = `${server}/api/v4`;
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const info = { id: "gitlab", name: "GitLab", reviewName: "merge request", server } as const;
  const host = new URL(server).host;

  /** Error text for the user: whatever the server said, without any chance of the token appearing in it. */
  const scrub = (text: string) => (token ? text.split(token).join("[token]") : text);

  async function request(
    method: string,
    path: string,
    what: string,
    body?: Json,
    accept = "application/json",
  ): Promise<Response> {
    if (!token || !/^[\x21-\x7e]+$/.test(token))
      throw new GitProviderError(
        "unauthorized",
        "No valid GitLab token is set. Create a token with the api scope and paste it in Settings → GitLab.",
      );
    const url = `${apiBase}${path}`;
    // The token goes to this server's API and nowhere else, whatever the path contained.
    if (!url.startsWith(`${apiBase}/`) || new URL(url).origin !== server)
      throw new GitProviderError("unsupported", `${what} is not on ${server}.`);
    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      throw new GitProviderError(
        "network",
        `Could not reach ${host}. Check your connection and the server address. If this is a self-managed server, it may not allow requests from other sites (CORS); ask its administrator to allow this app's address, or check whether a content blocker or network policy is stopping the request.`,
      );
    }
    if (!response.ok) throw await failure(response, what, method !== "GET");
    return response;
  }

  async function failure(response: Response, what: string, write: boolean): Promise<GitProviderError> {
    const { status } = response;
    let detail = "";
    try {
      detail = scrub(detailOf(await response.json())).slice(0, 300);
    } catch {
      /* no readable body */
    }
    if (status === 401)
      return new GitProviderError(
        "unauthorized",
        "GitLab rejected the token: it is invalid, expired or revoked. Create a new token with the api scope (or a project access token) and paste it in Settings → GitLab.",
        status,
      );
    if (
      status === 429 ||
      (status === 403 &&
        (response.headers.has("retry-after") ||
          response.headers.get("ratelimit-remaining") === "0" ||
          /rate limit|too many requests|retry later/i.test(detail)))
    )
      return new GitProviderError("rate-limited", `GitLab's rate limit was reached. ${describeWait(response)}`, status);
    if (status === 403) {
      if (write)
        return new GitProviderError(
          "forbidden",
          `The token cannot change ${what}. Proposing a change needs a token with the api scope (a personal access token, or a project access token with the Developer role or higher) and push access to that project. You can still save the file locally.`,
          status,
        );
      return new GitProviderError(
        "forbidden",
        `The token has no access to ${what}. It needs the read_api or api scope and access to that project.`,
        status,
      );
    }
    if (status === 404)
      return new GitProviderError(
        "not-found",
        `${upperFirst(what)} was not found, or the token cannot see it. GitLab answers 404 for a project the token has no access to; a project access token only reaches its own project.`,
        status,
      );
    if (write && (status === 400 || status === 409) && isStaleGuardMessage(detail))
      return new GitProviderError("conflict", `${upperFirst(what)} changed on GitLab.`, status);
    if (status === 409) return new GitProviderError("conflict", `${upperFirst(what)} changed on GitLab.`, status);
    if (status === 400 || status === 422)
      return new GitProviderError(
        "invalid",
        `GitLab refused the change to ${what}${detail ? `: ${detail.slice(0, 200)}` : "."}`,
        status,
      );
    return new GitProviderError("http", `GitLab returned an unexpected error (HTTP ${status}) for ${what}.`, status);
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
      throw new GitProviderError("http", `GitLab sent an answer for ${what} that could not be read.`, response.status);
    }
  }

  async function paginate<T>(path: string, what: string, map: (item: Json) => T | undefined): Promise<GitList<T>> {
    const items: T[] = [];
    const separator = path.includes("?") ? "&" : "?";
    let page = 1;
    for (let count = 1; count <= MAX_GIT_PAGES; count++) {
      const { data, response } = await json<Json[]>(`${path}${separator}per_page=${PAGE_SIZE}&page=${page}`, what);
      if (!Array.isArray(data)) break;
      for (const raw of data) {
        const item = map(raw);
        if (item !== undefined) items.push(item);
      }
      // GitLab names the next page in x-next-page (empty on the last page). Without the header, a full page
      // means there may be more.
      const header = response.headers.get("x-next-page");
      const next = header === null ? (data.length === PAGE_SIZE ? page + 1 : 0) : Number(header);
      if (!Number.isInteger(next) || next <= page) return { items, truncated: false };
      if (count === MAX_GIT_PAGES) return { items, truncated: true };
      page = next;
    }
    return { items, truncated: false };
  }

  /** `/projects/<group%2Fsub%2Fproject>`: the API takes the URL-encoded full path. */
  const projectBase = (owner: string, repo: string) => {
    const segments = [...checkedSegments(owner), ...checkedSegments(repo)];
    return `/projects/${encodeURIComponent(segments.join("/"))}`;
  };
  const projectName = (owner: string, repo: string) => `${owner}/${repo}`;

  /** One file's route segment: the whole path URL-encoded, slashes included. */
  const filePath = (path: string) => encodeURIComponent(checkedSegments(path).join("/"));

  const branchName = (branch: string) => {
    if (!branch || BAD_BRANCH.test(branch))
      throw new GitProviderError("invalid", `"${branch}" is not a valid branch name.`);
    return encodeURIComponent(branch);
  };

  const mrBase = (owner: string, repo: string, number: number) =>
    `${projectBase(owner, repo)}/merge_requests/${Math.trunc(number)}`;

  function toReview(raw: Json): GitReview {
    const number = typeof raw.iid === "number" ? raw.iid : undefined;
    const htmlUrl = asString(raw.web_url);
    if (number === undefined || !htmlUrl)
      throw new GitProviderError("http", "GitLab did not describe the merge request.");
    return {
      number,
      label: `!${number}`,
      htmlUrl,
      // opened is open; merged, closed and locked are not.
      state: raw.state === "opened" ? "open" : "closed",
      merged: raw.state === "merged",
    };
  }

  function toEntry(raw: Json): GitEntry | undefined {
    const name = asString(raw.name);
    const path = asString(raw.path);
    if (!name || path === undefined) return undefined;
    // The tree lists no sizes; a submodule is "commit".
    const type = raw.type === "blob" ? "file" : raw.type === "tree" ? "dir" : "other";
    return { name, path, type, size: 0 };
  }

  /** The project's default branch name; GitLab omits it for an empty project, where `main` is assumed. */
  async function defaultBranchOf(owner: string, repo: string): Promise<string> {
    const { data } = await json<Json>(projectBase(owner, repo), projectName(owner, repo));
    return asString(data.default_branch) || "main";
  }

  /** A project with no commits has no branches; GitLab says so with `empty_repo` on the project. */
  async function isEmptyProject(owner: string, repo: string): Promise<boolean> {
    try {
      const { data } = await json<Json>(projectBase(owner, repo), projectName(owner, repo));
      return data.empty_repo === true;
    } catch {
      return false;
    }
  }

  async function getFile(owner: string, repo: string, ref: string, path: string): Promise<GitFile> {
    const what = `${path} in ${owner}/${repo} at ${ref}`;
    const { data } = await json<Json>(
      `${projectBase(owner, repo)}/repository/files/${filePath(path)}?ref=${encodeURIComponent(ref)}`,
      what,
    );
    const size = typeof data.size === "number" ? data.size : 0;
    if (size > MAX_GIT_FILE_BYTES)
      throw new GitProviderError(
        "too-large",
        `${path} is ${(size / 1_000_000).toFixed(1)} MB. Files over 1 MB are not opened from GitLab.`,
      );
    const content = asString(data.content);
    const blob = asString(data.blob_id);
    const version = asString(data.last_commit_id);
    if (content === undefined || data.encoding !== "base64" || !blob || !version)
      throw new GitProviderError("unsupported", `GitLab did not return the content of ${path}.`);
    let text: string;
    try {
      text = decodeBase64Utf8(content);
    } catch {
      throw new GitProviderError("unsupported", `${path} is not UTF-8 text, so it cannot be opened as a diagram.`);
    }
    return {
      name: asString(data.file_name) ?? path.split("/").pop() ?? path,
      path: asString(data.file_path) ?? path,
      size,
      content: text,
      version,
      blob,
    };
  }

  const urlSegments = (value: string) => value.split("/").map(encodeURIComponent).join("/");
  const fileUrl = (owner: string, repo: string, ref: string, path: string) =>
    `${server}/${urlSegments(owner)}/${encodeURIComponent(repo)}/-/blob/${urlSegments(ref)}/${urlSegments(path)}`;

  function parseFileUrl(input: string): GitFileLink | undefined {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      return undefined;
    }
    // Only links on this client's own server, and the token is never used for any other.
    if (url.origin !== server) return undefined;
    let parts: string[];
    try {
      parts = url.pathname
        .split("/")
        .filter(Boolean)
        .map((part) => decodeURIComponent(part));
    } catch {
      return undefined;
    }
    // <group>/<subgroup…>/<project>/-/blob/<ref…>/<path…>; the "-" separates the project from the rest.
    const dash = parts.indexOf("-");
    if (dash < 2 || (parts[dash + 1] !== "blob" && parts[dash + 1] !== "raw")) return undefined;
    const rest = parts.slice(dash + 2);
    if (rest.length < 2) return undefined;
    const project = parts.slice(0, dash);
    return { owner: project.slice(0, -1).join("/"), repo: project.at(-1)!, segments: rest };
  }

  return {
    info,

    async getUser(): Promise<GitUser> {
      const { data } = await json<Json>("/user", "your GitLab account");
      const login = asString(data.username);
      if (!login) throw new GitProviderError("http", "GitLab did not say who this token belongs to.");
      return { login, name: asString(data.name) };
    },

    /** Projects the token is a member of with at least Developer access, most recently active first. */
    listRepositories(): Promise<GitList<GitRepository>> {
      return paginate(
        "/projects?membership=true&min_access_level=30&order_by=last_activity_at&simple=true",
        "your projects",
        (raw) => {
          const fullName = asString(raw.path_with_namespace);
          if (!fullName?.includes("/")) return undefined;
          const slash = fullName.lastIndexOf("/");
          const webUrl = asString(raw.web_url);
          return {
            owner: fullName.slice(0, slash),
            name: fullName.slice(slash + 1),
            fullName,
            defaultBranch: asString(raw.default_branch) ?? "main",
            private: raw.visibility === "private",
            pushedAt: asString(raw.last_activity_at),
            htmlUrl: webUrl && webUrl.startsWith(`${server}/`) ? webUrl : `${server}/${urlSegments(fullName)}`,
          };
        },
      );
    },

    listBranches(owner: string, repo: string): Promise<GitList<string>> {
      return paginate(`${projectBase(owner, repo)}/repository/branches`, `the branches of ${owner}/${repo}`, (raw) =>
        asString(raw.name),
      );
    },

    /** One folder's entries (one level, lazily). Folders first, then by name. */
    async listFolder(owner: string, repo: string, ref: string, path = ""): Promise<GitEntry[]> {
      if (path) checkedSegments(path);
      const { items } = await paginate(
        `${projectBase(owner, repo)}/repository/tree?ref=${encodeURIComponent(ref)}${path ? `&path=${encodeURIComponent(path.replace(/^\/+|\/+$/g, ""))}` : ""}`,
        `${path || "the top folder"} in ${owner}/${repo} at ${ref}`,
        toEntry,
      );
      return items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    },

    getFile,

    async getVersionText(owner: string, repo: string, version: GitVersionRef): Promise<string> {
      const what = `the opened version of ${version.path} in ${owner}/${repo}`;
      let route: string;
      if (version.blob) {
        if (!COMMIT_ID.test(version.blob))
          throw new GitProviderError("unsupported", "The file's GitLab blob ID is not valid.");
        route = `${projectBase(owner, repo)}/repository/blobs/${version.blob}/raw`;
      } else {
        // No blob ID (a version written by a commit): read the file as of that commit.
        if (!COMMIT_ID.test(version.version))
          throw new GitProviderError("unsupported", "The file's GitLab version is not a valid commit ID.");
        route = `${projectBase(owner, repo)}/repository/files/${filePath(version.path)}/raw?ref=${version.version}`;
      }
      const response = await request("GET", route, what, undefined, "*/*");
      try {
        return decodeUtf8Bytes(new Uint8Array(await response.arrayBuffer()));
      } catch {
        throw new GitProviderError("unsupported", "The opened version of the file is not UTF-8 text.");
      }
    },

    /** The commit a branch points at. Fails with not-found for tags and commit IDs, empty-repository for a project without commits. */
    async getBranchHead(owner: string, repo: string, branch: string): Promise<string> {
      let data: Json;
      try {
        ({ data } = await json<Json>(
          `${projectBase(owner, repo)}/repository/branches/${branchName(branch)}`,
          `branch ${branch} in ${owner}/${repo}`,
        ));
      } catch (error) {
        if (error instanceof GitProviderError && error.kind === "not-found" && (await isEmptyProject(owner, repo)))
          throw new GitProviderError(
            "empty-repository",
            "The project is empty: it has no commits yet, so it has no branch a merge request could go into.",
            error.status,
          );
        throw error;
      }
      const id = asString((data.commit as Json | undefined)?.id);
      if (!id || !COMMIT_ID.test(id))
        throw new GitProviderError("not-found", `${branch} is not a branch in ${owner}/${repo}.`, 404);
      return id;
    },

    async createBranch(owner: string, repo: string, branch: string, fromHead: string): Promise<void> {
      branchName(branch);
      if (!COMMIT_ID.test(fromHead)) throw new GitProviderError("unsupported", "The base commit is not a valid ID.");
      try {
        await request(
          "POST",
          `${projectBase(owner, repo)}/repository/branches`,
          `branch ${branch} in ${owner}/${repo}`,
          {
            branch,
            ref: fromHead,
          },
        );
      } catch (error) {
        // ASSUMPTION (L0): GitLab says 400 "Branch already exists". The shared flow turns an invalid answer with a
        // 400 or 422 status into "a branch of that name already exists", so any other 400 is passed on without a status.
        if (error instanceof GitProviderError && error.kind === "invalid" && !/already exists/i.test(error.message))
          throw new GitProviderError("invalid", error.message);
        throw error;
      }
    },

    async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
      await request(
        "DELETE",
        `${projectBase(owner, repo)}/repository/branches/${branchName(branch)}`,
        `branch ${branch} in ${owner}/${repo}`,
      );
    },

    /**
     * Commits one file with the Commits API. `version` is the `last_commit_id` the change was made against, so
     * GitLab refuses to overwrite a file that changed in the meantime; leave it out to create a file. Returns
     * the new commit's ID, which is the file's new guard.
     *
     * With no branch the project's default branch is used. ASSUMPTION (plan slice L0): for an empty project that
     * name is sent as `branch` with no `start_branch`, and GitLab creates the branch with the first commit.
     */
    async putFile(owner: string, repo: string, change: GitPutChange): Promise<{ version: string }> {
      if (change.branch !== undefined) branchName(change.branch);
      const branch = change.branch ?? (await defaultBranchOf(owner, repo));
      const { data } = await json<Json>(
        `${projectBase(owner, repo)}/repository/commits`,
        `${change.path} in ${owner}/${repo}`,
        "POST",
        {
          branch,
          commit_message: change.message,
          actions: [
            {
              action: change.version ? "update" : "create",
              file_path: checkedSegments(change.path).join("/"),
              content: encodeBase64Utf8(change.content),
              encoding: "base64",
              ...(change.version ? { last_commit_id: change.version } : {}),
            },
          ],
        },
      );
      const id = asString(data.id);
      if (!id) throw new GitProviderError("http", "GitLab did not confirm the commit.");
      return { version: id };
    },

    async createReview(
      owner: string,
      repo: string,
      review: { title: string; head: string; base: string; body: string },
    ): Promise<GitReview> {
      const { data } = await json<Json>(
        `${projectBase(owner, repo)}/merge_requests`,
        `a merge request in ${owner}/${repo}`,
        "POST",
        {
          source_branch: review.head,
          target_branch: review.base,
          title: review.title,
          description: review.body,
        },
      );
      return toReview(data);
    },

    async getReview(owner: string, repo: string, number: number): Promise<GitReview> {
      const { data } = await json<Json>(mrBase(owner, repo, number), `merge request !${number} in ${owner}/${repo}`);
      return toReview(data);
    },

    async updateReview(owner: string, repo: string, number: number, body: string): Promise<GitReview> {
      const { data } = await json<Json>(
        mrBase(owner, repo, number),
        `merge request !${number} in ${owner}/${repo}`,
        "PUT",
        { description: body },
      );
      return toReview(data);
    },

    parseFileUrl,
    fileUrl,

    /**
     * Opens a file from a pasted link. The ref and path run together in the link and branch names can contain
     * slashes, so the splits are tried longest ref first until the API finds the file. A 404 for one split just
     * means it was the wrong split; any other failure stops at once.
     */
    async openFileFromUrl(input: string | GitFileLink): Promise<GitOpenedFile> {
      const parsed = typeof input === "string" ? parseFileUrl(input) : input;
      if (!parsed)
        throw new GitProviderError(
          "invalid-url",
          `That is not a link to a file on ${host}. Use a link like ${server}/group/project/-/blob/main/folder/diagram.puml.`,
        );
      for (const { ref, path } of refPathCandidates(parsed.segments)) {
        try {
          const file = await getFile(parsed.owner, parsed.repo, ref, path);
          return {
            file,
            origin: createOrigin(info, {
              owner: parsed.owner,
              repo: parsed.repo,
              ref,
              path: file.path,
              version: file.version,
              blob: file.blob,
              htmlUrl: fileUrl(parsed.owner, parsed.repo, ref, file.path),
            }),
          };
        } catch (error) {
          if (!(error instanceof GitProviderError && error.kind === "not-found")) throw error;
        }
      }
      throw new GitProviderError(
        "not-found",
        `That file was not found in ${parsed.owner}/${parsed.repo}, or the token cannot see the project. GitLab answers 404 for a project the token has no access to.`,
        404,
      );
    },
  };
}
