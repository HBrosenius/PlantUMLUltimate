import { describe, expect, it, vi } from "vitest";
import { createOrigin } from "./git-origin";
import { createNewFileMarkdown, addFirstFile, proposeNewFile } from "./git-new-file";
import { GitProviderError, refPathCandidates } from "./git-provider";
import { proposeChange, UpstreamChangedError } from "./git-propose";
import { mergeUpstream } from "./git-upstream";
import { createGitLabClient, isStaleGuardMessage } from "./gitlab-client";

const SERVER = "https://gitlab.example.com";
const API = `${SERVER}/api/v4`;
const TOKEN = "glpat-unit-test-token-0000";
const PROJECT = "/api/v4/projects/team%2Fsub%2Fdocs";

const id = (n: number) => n.toString(16).padStart(40, "0");
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const unb64 = (text: unknown) => Buffer.from(String(text), "base64").toString("utf8");

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

type Call = { method: string; path: string; search: URLSearchParams; body: Record<string, unknown> | undefined };
type StoredFile = { content: string; commit: string; blob: string };
type Branch = { head: string; files: Record<string, StoredFile> };

const STALE = { message: "You are attempting to update a file that has changed since you started editing it." };

/**
 * A small stateful GitLab: one project (team/sub/docs) with branches, files that remember the last commit that
 * touched them, and merge requests. It checks the headers on every request.
 */
function fakeGitLab(initial: Record<string, string> = {}, options: { empty?: boolean } = {}) {
  let counter = 100;
  const next = () => id(++counter);
  const calls: Call[] = [];
  const branches: Record<string, Branch> = {};
  /** Every blob and every file-as-of-a-commit ever written, so older versions can be read back. */
  const blobs: Record<string, string> = {};
  const asOf: Record<string, string> = {};
  const stored = (path: string, content: string, commit: string): StoredFile => {
    const blob = next();
    blobs[blob] = content;
    asOf[`${commit}:${path}`] = content;
    return { content, commit, blob };
  };
  const merges: Record<number, { source: string; target: string; description: string; state: string }> = {};
  let empty = options.empty === true;
  if (!empty) {
    branches.main = { head: next(), files: {} };
    for (const [path, content] of Object.entries(initial)) branches.main.files[path] = stored(path, content, next());
  }

  /** A commit made by someone else, outside the app. */
  function commitDirect(branch: string, path: string, content: string) {
    const commit = next();
    branches[branch]!.head = commit;
    branches[branch]!.files[path] = stored(path, content, commit);
  }

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    expect(url.origin).toBe(SERVER);
    expect(url.pathname.startsWith("/api/v4/")).toBe(true);
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init!.credentials).toBe("omit");
    expect(init!.cache).toBe("no-store");
    const call: Call = {
      method: init!.method ?? "GET",
      path: url.pathname.replace("/api/v4", ""),
      search: url.searchParams,
      body: init!.body ? (JSON.parse(String(init!.body)) as Record<string, unknown>) : undefined,
    };
    calls.push(call);
    const route = `${call.method} ${call.path}`;
    const p = "/projects/team%2Fsub%2Fdocs";
    const missing = () => reply({ message: "404 Not Found" }, 404);

    if (route === "GET /user") return reply({ username: "ada", name: "Ada L" });
    if (route === `GET ${p}`)
      return reply({
        default_branch: empty ? null : "main",
        empty_repo: empty,
        path_with_namespace: "team/sub/docs",
      });
    if (route === `GET ${p}/repository/branches`) return reply(Object.keys(branches).map((name) => ({ name })));
    let match = /^GET \/projects\/team%2Fsub%2Fdocs\/repository\/branches\/(.+)$/.exec(route);
    if (match) {
      const branch = branches[decodeURIComponent(match[1]!)];
      return branch ? reply({ name: decodeURIComponent(match[1]!), commit: { id: branch.head } }) : missing();
    }
    if (route === `POST ${p}/repository/branches`) {
      const name = String(call.body!.branch);
      if (branches[name]) return reply({ message: "Branch already exists" }, 400);
      const from = Object.values(branches).find((branch) => branch.head === call.body!.ref);
      if (!from) return reply({ message: "Invalid reference name: " + String(call.body!.ref) }, 400);
      branches[name] = { head: from.head, files: { ...from.files } };
      return reply({ name, commit: { id: from.head } }, 201);
    }
    match = /^DELETE \/projects\/team%2Fsub%2Fdocs\/repository\/branches\/(.+)$/.exec(route);
    if (match) {
      delete branches[decodeURIComponent(match[1]!)];
      return new Response(null, { status: 204 });
    }
    match = /^GET \/projects\/team%2Fsub%2Fdocs\/repository\/files\/(.+)\/raw$/.exec(route);
    if (match) {
      const path = decodeURIComponent(match[1]!);
      // The text of a file as of a commit: the version a commit left it in.
      const ref = call.search.get("ref")!;
      const text = asOf[`${ref}:${path}`];
      if (text !== undefined) return new Response(text, { status: 200 });
      return missing();
    }
    match = /^GET \/projects\/team%2Fsub%2Fdocs\/repository\/files\/(.+)$/.exec(route);
    if (match) {
      const path = decodeURIComponent(match[1]!);
      const file = branches[call.search.get("ref")!]?.files[path];
      if (!file) return reply({ message: "404 File Not Found" }, 404);
      return reply({
        file_name: path.split("/").pop(),
        file_path: path,
        size: new TextEncoder().encode(file.content).length,
        encoding: "base64",
        content: b64(file.content),
        blob_id: file.blob,
        last_commit_id: file.commit,
        ref: call.search.get("ref"),
      });
    }
    match = /^GET \/projects\/team%2Fsub%2Fdocs\/repository\/blobs\/([0-9a-f]+)\/raw$/.exec(route);
    if (match) {
      const text = blobs[match[1]!];
      if (text !== undefined) return new Response(text, { status: 200 });
      return missing();
    }
    if (route === `GET ${p}/repository/tree`) {
      const ref = call.search.get("ref")!;
      const folder = call.search.get("path") ?? "";
      if (!branches[ref]) return missing();
      const entries = new Map<string, "blob" | "tree">();
      for (const path of Object.keys(branches[ref]!.files)) {
        if (folder && !path.startsWith(`${folder}/`)) continue;
        const rest = path.slice(folder ? folder.length + 1 : 0).split("/");
        entries.set(rest[0]!, rest.length > 1 ? "tree" : "blob");
      }
      return reply(
        [...entries].map(([name, type]) => ({ id: next(), name, type, path: folder ? `${folder}/${name}` : name })),
      );
    }
    if (route === `POST ${p}/repository/commits`) {
      const name = String(call.body!.branch);
      let branch = branches[name];
      if (!branch) {
        if (!empty) return reply({ message: `A branch called '${name}' does not exist` }, 400);
        branch = branches[name] = { head: "", files: {} };
        empty = false;
      }
      const [action] = call.body!.actions as Array<Record<string, string>>;
      const existing = branch.files[action!.file_path!];
      if (action!.action === "create" && existing)
        return reply({ message: "A file with this name already exists" }, 400);
      if (action!.action === "update" && existing && existing.commit !== action!.last_commit_id)
        return reply(STALE, 400);
      const commit = next();
      branch.head = commit;
      branch.files[action!.file_path!] = stored(action!.file_path!, unb64(action!.content), commit);
      return reply({ id: commit, short_id: commit.slice(0, 8) }, 201);
    }
    if (route === `POST ${p}/merge_requests`) {
      const iid = Object.keys(merges).length + 1;
      merges[iid] = {
        source: String(call.body!.source_branch),
        target: String(call.body!.target_branch),
        description: String(call.body!.description),
        state: "opened",
      };
      return reply({ iid, web_url: `${SERVER}/team/sub/docs/-/merge_requests/${iid}`, state: "opened" }, 201);
    }
    match = /^(GET|PUT) \/projects\/team%2Fsub%2Fdocs\/merge_requests\/(\d+)$/.exec(route);
    if (match) {
      const iid = Number(match[2]);
      const merge = merges[iid];
      if (!merge) return reply({ message: "404 Not found" }, 404);
      if (match[1] === "PUT") merge.description = String(call.body!.description);
      return reply({ iid, web_url: `${SERVER}/team/sub/docs/-/merge_requests/${iid}`, state: merge.state });
    }
    return missing();
  };

  const fetchMock = vi.fn(handler);
  const client = createGitLabClient({ server: SERVER, token: TOKEN, fetch: fetchMock as unknown as typeof fetch });
  return {
    client,
    calls,
    branches,
    merges,
    commitDirect,
    fetchMock,
    paths: () => calls.map((c) => `${c.method} ${c.path}`),
  };
}

/** A client whose every request is answered by `handler`, for status and error mapping. */
function clientWith(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init ?? {}),
  );
  return {
    client: createGitLabClient({ server: SERVER, token: TOKEN, fetch: fetchMock as unknown as typeof fetch }),
    fetchMock,
  };
}

const unexpected = (): never => {
  throw new Error("expected the call to fail");
};

const flow = "@startuml\nA -> B\nB -> C\nC -> D\nD -> E\nE -> F\n@enduml\n";
const LINK = `${SERVER}/team/sub/docs/-/blob/main/docs/flow.puml`;

describe("GitLab client requests", () => {
  it("sends the token as a bearer header to the server's API only, with no cookies and no caching", async () => {
    const { client, fetchMock } = clientWith(() => reply({ username: "ada", name: "Ada L" }));
    expect(await client.getUser()).toEqual({ login: "ada", name: "Ada L" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${API}/user`);
    expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store" });
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("describes itself as GitLab with merge requests on its own server", () => {
    expect(createGitLabClient({ server: SERVER, token: TOKEN }).info).toEqual({
      id: "gitlab",
      name: "GitLab",
      reviewName: "merge request",
      server: SERVER,
    });
  });

  it("accepts only an https server, reduced to its origin", async () => {
    for (const server of [
      "http://gitlab.example.com",
      "gitlab.example.com",
      "https://gitlab.example.com/gitlab",
      "https://user:secret@gitlab.example.com",
      "https://gitlab.example.com/?a=1",
      "ftp://gitlab.example.com",
      "",
    ])
      expect(() => createGitLabClient({ server, token: TOKEN }), server).toThrow(GitProviderError);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => reply({ username: "ada" }));
    await createGitLabClient({
      server: "https://GitLab.Example.com/",
      token: TOKEN,
      fetch: fetchMock as unknown as typeof fetch,
    }).getUser();
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://gitlab.example.com/api/v4/user");
  });

  it("never sends a request for a token that cannot be a header value", async () => {
    const fetchMock = vi.fn(async () => reply({}));
    const client = createGitLabClient({
      server: SERVER,
      token: "bad\ntoken",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await expect(client.getUser()).rejects.toMatchObject({ kind: "unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let a crafted path climb out of the API routes", async () => {
    const { client, fetchMock } = clientWith(() => reply({}));
    await expect(client.getFile("team", "docs", "main", "docs/../../../user")).rejects.toMatchObject({
      kind: "unsupported",
    });
    await expect(client.getFile("team", "..", "main", "a.puml")).rejects.toMatchObject({ kind: "unsupported" });
    await expect(client.getBranchHead("team", "docs", "../x")).rejects.toMatchObject({ kind: "invalid" });
    await expect(client.listFolder("team", "docs", "main", "./docs")).rejects.toMatchObject({ kind: "unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GitLab client lists", () => {
  it("lists member projects with write access, splitting the full path into namespace and project", async () => {
    const { client, fetchMock } = clientWith(() =>
      reply(
        [
          {
            path_with_namespace: "team/sub/docs",
            default_branch: "trunk",
            visibility: "private",
            last_activity_at: "2026-11-20T10:00:00Z",
            web_url: `${SERVER}/team/sub/docs`,
          },
          { path_with_namespace: "ada/notes", web_url: "https://elsewhere.example/ada/notes" },
          { name: "no path" },
        ],
        200,
        { "x-next-page": "" },
      ),
    );
    const list = await client.listRepositories();
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/v4/projects");
    expect(url.search).toBe(
      "?membership=true&min_access_level=30&order_by=last_activity_at&simple=true&per_page=100&page=1",
    );
    expect(list.truncated).toBe(false);
    expect(list.items).toEqual([
      {
        owner: "team/sub",
        name: "docs",
        fullName: "team/sub/docs",
        defaultBranch: "trunk",
        private: true,
        pushedAt: "2026-11-20T10:00:00Z",
        htmlUrl: `${SERVER}/team/sub/docs`,
      },
      {
        owner: "ada",
        name: "notes",
        fullName: "ada/notes",
        defaultBranch: "main",
        private: false,
        pushedAt: undefined,
        // A link that does not point at the server is replaced by one that does.
        htmlUrl: `${SERVER}/ada/notes`,
      },
    ]);
  });

  it("follows x-next-page, and stops when it is empty", async () => {
    const pages: string[] = [];
    const { client } = clientWith((url) => {
      const page = Number(url.searchParams.get("page"));
      pages.push(`${url.searchParams.get("per_page")}:${page}`);
      const items = Array.from({ length: page === 3 ? 3 : 100 }, (_, i) => ({
        path_with_namespace: `g/p${page}-${i}`,
      }));
      return reply(items, 200, { "x-next-page": page === 3 ? "" : String(page + 1) });
    });
    const list = await client.listRepositories();
    expect(pages).toEqual(["100:1", "100:2", "100:3"]);
    expect(list.items).toHaveLength(203);
    expect(list.truncated).toBe(false);
  });

  it("reads at most ten pages and says when there were more", async () => {
    let count = 0;
    const { client } = clientWith((url) => {
      count++;
      const page = Number(url.searchParams.get("page"));
      return reply(
        Array.from({ length: 100 }, (_, i) => ({ name: `b${page}-${i}` })),
        200,
        { "x-next-page": String(page + 1) },
      );
    });
    const list = await client.listBranches("team/sub", "docs");
    expect(count).toBe(10);
    expect(list.items).toHaveLength(1000);
    expect(list.truncated).toBe(true);
  });

  it("without the header, a short page is the last one and a full page asks for the next", async () => {
    let count = 0;
    const { client } = clientWith(() => {
      count++;
      return reply(count === 1 ? Array.from({ length: 100 }, (_, i) => ({ name: `b${i}` })) : [{ name: "last" }]);
    });
    const list = await client.listBranches("team/sub", "docs");
    expect(list.items).toHaveLength(101);
    expect(count).toBe(2);
  });

  it("reads branches from the project's route, encoding the whole project path", async () => {
    const { client, fetchMock } = clientWith(() => reply([{ name: "main" }, { name: "feature/x" }]));
    expect((await client.listBranches("team/sub", "docs")).items).toEqual(["main", "feature/x"]);
    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(`${PROJECT}/repository/branches`);
  });

  it("lists one folder level from the tree, folders first, paginated", async () => {
    const { client, fetchMock } = clientWith(() =>
      reply([
        { name: "z.puml", type: "blob", path: "docs/z.puml" },
        { name: "sub", type: "tree", path: "docs/sub" },
        { name: "a.puml", type: "blob", path: "docs/a.puml" },
        { name: "module", type: "commit", path: "docs/module" },
      ]),
    );
    const entries = await client.listFolder("team/sub", "docs", "feature/x", "docs");
    expect(entries.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      "dir:sub",
      "file:a.puml",
      "file:z.puml",
      "other:module",
    ]);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe(`${PROJECT}/repository/tree`);
    expect(url.searchParams.get("path")).toBe("docs");
    expect(url.searchParams.get("ref")).toBe("feature/x");
    expect(url.searchParams.get("per_page")).toBe("100");
  });
});

describe("GitLab file links", () => {
  const { client } = clientWith(() => reply({}));

  it("parses a link in nested groups, with the ref and path left together", () => {
    expect(client.parseFileUrl(LINK)).toEqual({
      owner: "team/sub",
      repo: "docs",
      segments: ["main", "docs", "flow.puml"],
    });
    expect(client.parseFileUrl(`${SERVER}/docs/-/blob/main/a.puml`)).toBeUndefined();
    expect(client.parseFileUrl(`${SERVER}/solo/docs/-/blob/main/a.puml`)).toEqual({
      owner: "solo",
      repo: "docs",
      segments: ["main", "a.puml"],
    });
    expect(client.parseFileUrl(`${SERVER}/a/b/c/d/-/raw/main/a.puml`)?.owner).toBe("a/b/c");
  });

  it("drops the query and fragment and decodes the path", () => {
    expect(client.parseFileUrl(`${LINK}?plain=1#L10`)?.segments).toEqual(["main", "docs", "flow.puml"]);
    expect(client.parseFileUrl(`${SERVER}/team/docs/-/blob/main/my%20docs/a%2Bb.puml`)?.segments).toEqual([
      "main",
      "my docs",
      "a+b.puml",
    ]);
  });

  it("accepts only https links on its own server, and only files", () => {
    expect(client.parseFileUrl("https://gitlab.com/team/docs/-/blob/main/a.puml")).toBeUndefined();
    expect(client.parseFileUrl("http://gitlab.example.com/team/docs/-/blob/main/a.puml")).toBeUndefined();
    expect(client.parseFileUrl("https://gitlab.example.com.evil.test/team/docs/-/blob/main/a.puml")).toBeUndefined();
    expect(client.parseFileUrl("https://github.com/o/r/blob/main/a.puml")).toBeUndefined();
    expect(client.parseFileUrl(`${SERVER}/team/docs/-/tree/main/docs`)).toBeUndefined();
    expect(client.parseFileUrl(`${SERVER}/team/docs`)).toBeUndefined();
    expect(client.parseFileUrl(`${SERVER}/team/docs/-/blob/main`)).toBeUndefined();
    expect(client.parseFileUrl("not a url")).toBeUndefined();
  });

  it("builds the link with encoded segments and the ref's slashes kept", () => {
    expect(client.fileUrl("team/sub", "docs", "feature/x", "my docs/a b.puml")).toBe(
      `${SERVER}/team/sub/docs/-/blob/feature/x/my%20docs/a%20b.puml`,
    );
  });

  it("tries the longest ref first, like GitHub links", () => {
    expect(refPathCandidates(["feature", "x", "a.puml"])[0]).toEqual({ ref: "feature/x", path: "a.puml" });
  });

  it("resolves a ref that contains a slash against the API", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    fake.branches["feature/x"] = {
      head: id(900),
      files: { "docs/flow.puml": { content: flow, commit: id(901), blob: id(902) } },
    };
    const { file, origin } = await fake.client.openFileFromUrl(
      `${SERVER}/team/sub/docs/-/blob/feature/x/docs/flow.puml?plain=1#L3`,
    );
    const refs = fake.calls.map((call) => call.search.get("ref"));
    expect(refs).toEqual(["feature/x/docs", "feature/x"]);
    expect(file.version).toBe(id(901));
    expect(origin).toEqual({
      provider: "gitlab",
      server: SERVER,
      owner: "team/sub",
      repo: "docs",
      ref: "feature/x",
      path: "docs/flow.puml",
      version: id(901),
      blob: id(902),
      htmlUrl: `${SERVER}/team/sub/docs/-/blob/feature/x/docs/flow.puml`,
    });
  });

  it("explains a link from another server, a link that is not a file, and a file that is not there", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    await expect(fake.client.openFileFromUrl("https://github.com/o/r/blob/main/a.puml")).rejects.toMatchObject({
      kind: "invalid-url",
    });
    await expect(fake.client.openFileFromUrl(`${SERVER}/team/sub/docs/-/blob/main/nope/x.puml`)).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
      message: expect.stringContaining("team/sub/docs") as unknown,
    });
    // A failure that is not a 404 stops at once instead of trying the other splits.
    const denied = clientWith(() => reply({ message: "401 Unauthorized" }, 401));
    await expect(denied.client.openFileFromUrl(LINK)).rejects.toMatchObject({ kind: "unauthorized" });
    expect(denied.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("GitLab files", () => {
  it("reads a file by its whole path URL-encoded, decodes UTF-8, and returns the guard and the blob", async () => {
    const text = "@startuml\nAlice -> Bob : Grüße — 日本語 🙂\n@enduml\n";
    const fake = fakeGitLab({ "docs/my diagrams/a.puml": text });
    const file = await fake.client.getFile("team/sub", "docs", "main", "docs/my diagrams/a.puml");
    const call = fake.calls[0]!;
    expect(call.path).toBe("/projects/team%2Fsub%2Fdocs/repository/files/docs%2Fmy%20diagrams%2Fa.puml");
    expect(call.search.get("ref")).toBe("main");
    expect(file).toMatchObject({
      content: text,
      name: "a.puml",
      path: "docs/my diagrams/a.puml",
      size: new TextEncoder().encode(text).length,
      version: fake.branches.main!.files["docs/my diagrams/a.puml"]!.commit,
      blob: fake.branches.main!.files["docs/my diagrams/a.puml"]!.blob,
    });
    expect(file.version).not.toBe(file.blob);
  });

  it("refuses a file over 1 MB, a file that is not base64 text, and a file that is not UTF-8", async () => {
    const big = clientWith(() =>
      reply({ size: 1_500_000, encoding: "base64", content: "", blob_id: "b", last_commit_id: "c" }),
    );
    await expect(big.client.getFile("g", "p", "main", "big.puml")).rejects.toMatchObject({ kind: "too-large" });
    const odd = clientWith(() =>
      reply({ size: 3, encoding: "text", content: "abc", blob_id: "b", last_commit_id: "c" }),
    );
    await expect(odd.client.getFile("g", "p", "main", "a.puml")).rejects.toMatchObject({ kind: "unsupported" });
    const noGuard = clientWith(() => reply({ size: 3, encoding: "base64", content: b64("abc"), blob_id: "b" }));
    await expect(noGuard.client.getFile("g", "p", "main", "a.puml")).rejects.toMatchObject({ kind: "unsupported" });
    const binary = clientWith(() =>
      reply({
        size: 2,
        encoding: "base64",
        content: Buffer.from([0xff, 0xfe]).toString("base64"),
        blob_id: "b",
        last_commit_id: "c",
      }),
    );
    await expect(binary.client.getFile("g", "p", "main", "a.png")).rejects.toMatchObject({
      kind: "unsupported",
      message: expect.stringContaining("not UTF-8") as unknown,
    });
  });

  it("reads an older version by blob when it has one, and as of a commit when it does not", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const stored = fake.branches.main!.files["docs/flow.puml"]!;
    expect(
      await fake.client.getVersionText("team/sub", "docs", {
        version: stored.commit,
        blob: stored.blob,
        path: "docs/flow.puml",
      }),
    ).toBe(flow);
    expect(fake.paths()).toEqual([`GET /projects/team%2Fsub%2Fdocs/repository/blobs/${stored.blob}/raw`]);
    expect(
      await fake.client.getVersionText("team/sub", "docs", { version: stored.commit, path: "docs/flow.puml" }),
    ).toBe(flow);
    expect(fake.calls[1]!.path).toBe("/projects/team%2Fsub%2Fdocs/repository/files/docs%2Fflow.puml/raw");
    expect(fake.calls[1]!.search.get("ref")).toBe(stored.commit);
    await expect(
      fake.client.getVersionText("team/sub", "docs", { version: "x", blob: "../user", path: "a.puml" }),
    ).rejects.toMatchObject({ kind: "unsupported" });
    await expect(
      fake.client.getVersionText("team/sub", "docs", { version: "main", path: "a.puml" }),
    ).rejects.toMatchObject({
      kind: "unsupported",
    });
  });
});

describe("GitLab branches and commits", () => {
  it("reads a branch head, creates a branch from it, and deletes it", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const head = await fake.client.getBranchHead("team/sub", "docs", "main");
    expect(head).toBe(fake.branches.main!.head);
    await fake.client.createBranch("team/sub", "docs", "plantuml/flow-20261123", head);
    expect(fake.calls[1]!.body).toEqual({ branch: "plantuml/flow-20261123", ref: head });
    expect(fake.branches["plantuml/flow-20261123"]).toBeDefined();
    await fake.client.deleteBranch("team/sub", "docs", "plantuml/flow-20261123");
    expect(fake.paths().slice(1)).toEqual([
      "POST /projects/team%2Fsub%2Fdocs/repository/branches",
      "DELETE /projects/team%2Fsub%2Fdocs/repository/branches/plantuml%2Fflow-20261123",
    ]);
    expect(fake.branches["plantuml/flow-20261123"]).toBeUndefined();
  });

  it("finds a missing branch (not-found) and tells an empty project apart", async () => {
    const fake = fakeGitLab({ "a.puml": flow });
    await expect(fake.client.getBranchHead("team/sub", "docs", "v1.0")).rejects.toMatchObject({ kind: "not-found" });
    const empty = fakeGitLab({}, { empty: true });
    await expect(empty.client.getBranchHead("team/sub", "docs", "main")).rejects.toMatchObject({
      kind: "empty-repository",
      status: 404,
    });
  });

  it("commits with the Commits API, guarded by last_commit_id, and returns the new commit as the next guard", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const guard = fake.branches.main!.files["docs/flow.puml"]!.commit;
    const result = await fake.client.putFile("team/sub", "docs", {
      path: "docs/flow.puml",
      branch: "main",
      message: "Update flow.puml",
      content: `${flow}'x\n`,
      version: guard,
    });
    expect(fake.calls[0]).toMatchObject({
      method: "POST",
      path: `${PROJECT.replace("/api/v4", "")}/repository/commits`,
    });
    expect(fake.calls[0]!.body).toEqual({
      branch: "main",
      commit_message: "Update flow.puml",
      actions: [
        {
          action: "update",
          file_path: "docs/flow.puml",
          content: b64(`${flow}'x\n`),
          encoding: "base64",
          last_commit_id: guard,
        },
      ],
    });
    expect(result.version).toBe(fake.branches.main!.head);
    expect(result.version).not.toBe(guard);
    expect(fake.calls[0]!.body).not.toHaveProperty("start_branch");
  });

  it("creates a file without a guard: the create action carries no last_commit_id", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const result = await fake.client.putFile("team/sub", "docs", {
      path: "docs/new.puml",
      branch: "main",
      message: "Add new.puml",
      content: "@startuml\n@enduml\n",
    });
    const [action] = fake.calls[0]!.body!.actions as Array<Record<string, unknown>>;
    expect(action).toEqual({
      action: "create",
      file_path: "docs/new.puml",
      content: b64("@startuml\n@enduml\n"),
      encoding: "base64",
    });
    expect(result.version).toBe(fake.branches.main!.head);
  });

  it("with no branch commits to the project's default branch; in an empty project it creates it", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    await fake.client.putFile("team/sub", "docs", { path: "docs/new.puml", message: "Add", content: "x" });
    expect(fake.paths()).toEqual([
      "GET /projects/team%2Fsub%2Fdocs",
      "POST /projects/team%2Fsub%2Fdocs/repository/commits",
    ]);
    expect(fake.calls[1]!.body!.branch).toBe("main");

    const empty = fakeGitLab({}, { empty: true });
    const result = await empty.client.putFile("team/sub", "docs", { path: "first.puml", message: "Add", content: "x" });
    // The project reports no default branch, so main is assumed; no start_branch is sent.
    expect(empty.calls[1]!.body).toMatchObject({ branch: "main", actions: [{ action: "create" }] });
    expect(empty.calls[1]!.body).not.toHaveProperty("start_branch");
    expect(empty.branches.main!.head).toBe(result.version);
  });

  it("maps a stale last_commit_id to the conflict kind", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const stale = fake.branches.main!.files["docs/flow.puml"]!.commit;
    fake.commitDirect("main", "docs/flow.puml", `${flow}'upstream\n`);
    const error = (await fake.client
      .putFile("team/sub", "docs", {
        path: "docs/flow.puml",
        branch: "main",
        message: "m",
        content: "x",
        version: stale,
      })
      .catch((failure: unknown) => failure)) as GitProviderError;
    expect(error).toBeInstanceOf(GitProviderError);
    expect(error).toMatchObject({ kind: "conflict", status: 400 });
    expect(error.message).toBe("Docs/flow.puml in team/sub/docs changed on GitLab.");
  });

  it("matches the stale-guard answer loosely, in one place", () => {
    for (const message of [
      "You are attempting to update a file that has changed since you started editing it.",
      "The file has been modified since the last commit was fetched",
      "file docs/a.puml has changed since last_commit_id abc",
      "Invalid last_commit_id",
    ])
      expect(isStaleGuardMessage(message), message).toBe(true);
    for (const message of [
      "A file with this name already exists",
      "Branch already exists",
      "You are not allowed to push into this branch",
      "",
    ])
      expect(isStaleGuardMessage(message), message).toBe(false);
  });

  it("does not take a stale-sounding answer to a read or another status as a conflict", async () => {
    const { client } = clientWith(() => reply(STALE, 500));
    await expect(
      client.putFile("g", "p", { path: "a.puml", branch: "main", message: "m", content: "x", version: id(1) }),
    ).rejects.toMatchObject({ kind: "http" });
    const other = clientWith(() => reply({ message: "A file with this name already exists" }, 400));
    await expect(
      other.client.putFile("g", "p", { path: "a.puml", branch: "main", message: "m", content: "x" }),
    ).rejects.toMatchObject({ kind: "invalid", status: 400 });
  });
});

describe("GitLab merge requests", () => {
  it("creates, reads and updates a merge request, labelled !iid", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const created = await fake.client.createReview("team/sub", "docs", {
      title: "Update flow.puml",
      head: "plantuml/flow-20261123",
      base: "main",
      body: "## Diagram changes",
    });
    expect(fake.calls[0]!.body).toEqual({
      source_branch: "plantuml/flow-20261123",
      target_branch: "main",
      title: "Update flow.puml",
      description: "## Diagram changes",
    });
    expect(created).toEqual({
      number: 1,
      label: "!1",
      htmlUrl: `${SERVER}/team/sub/docs/-/merge_requests/1`,
      state: "open",
      merged: false,
    });
    expect(await fake.client.getReview("team/sub", "docs", 1)).toEqual(created);
    expect(fake.calls[1]).toMatchObject({ method: "GET", path: "/projects/team%2Fsub%2Fdocs/merge_requests/1" });
    await fake.client.updateReview("team/sub", "docs", 1, "new text");
    expect(fake.calls[2]).toMatchObject({ method: "PUT", body: { description: "new text" } });
    expect(fake.merges[1]!.description).toBe("new text");
  });

  it("maps the states: opened is open; merged, closed and locked are not, and only merged sets merged", async () => {
    const states = new Map([
      ["opened", { state: "open", merged: false }],
      ["merged", { state: "closed", merged: true }],
      ["closed", { state: "closed", merged: false }],
      ["locked", { state: "closed", merged: false }],
    ]);
    for (const [gitlabState, expected] of states) {
      const { client } = clientWith(() =>
        reply({ iid: 4, web_url: `${SERVER}/g/p/-/merge_requests/4`, state: gitlabState }),
      );
      expect(await client.getReview("g", "p", 4), gitlabState).toMatchObject({ ...expected, number: 4, label: "!4" });
    }
  });

  it("reports a merge request that cannot be described, and a missing one as not-found", async () => {
    const odd = clientWith(() => reply({ state: "opened" }));
    await expect(odd.client.getReview("g", "p", 1)).rejects.toMatchObject({ kind: "http" });
    const fake = fakeGitLab({});
    await expect(fake.client.getReview("team/sub", "docs", 9)).rejects.toMatchObject({
      kind: "not-found",
      message: expect.stringContaining("Merge request !9") as unknown,
    });
  });
});

describe("GitLab errors", () => {
  const failing = (status: number, headers: Record<string, string> = {}, body: unknown = { message: "x" }) =>
    clientWith(() => reply(body, status, headers)).client;

  it("401: the token was rejected, with the api scope named", async () => {
    const error = await failing(401)
      .getUser()
      .then(unexpected, (e: unknown) => e as GitProviderError);
    expect(error).toMatchObject({ kind: "unauthorized", status: 401 });
    expect(error.message).toContain("Settings → GitLab");
    expect(error.message).toContain("api scope");
  });

  it("403: read access, with the scope that is needed", async () => {
    const error = await failing(403, {}, { message: "403 Forbidden" })
      .getFile("g", "p", "main", "a.puml")
      .then(unexpected, (e: unknown) => e as GitProviderError);
    expect(error).toMatchObject({ kind: "forbidden", status: 403 });
    expect(error.message).toContain("read_api or api scope");
  });

  it("403 on a change: names the api scope, the project access token and push access", async () => {
    const error = await failing(403, {}, { message: "403 Forbidden" })
      .putFile("g", "p", { path: "a.puml", branch: "main", message: "m", content: "x" })
      .then(unexpected, (e: unknown) => e as GitProviderError);
    expect(error).toMatchObject({ kind: "forbidden", status: 403 });
    expect(error.message).toContain("api scope");
    expect(error.message).toContain("project access token");
    expect(error.message).toContain("save the file locally");
  });

  it("404: not found or not visible, in GitLab's words", async () => {
    const error = await failing(404)
      .getFile("g", "p", "main", "a.puml")
      .then(unexpected, (e: unknown) => e as GitProviderError);
    expect(error).toMatchObject({ kind: "not-found", status: 404 });
    expect(error.message).toContain("project");
    const mr = await failing(404)
      .getReview("g", "p", 3)
      .then(unexpected, (e: unknown) => e as GitProviderError);
    expect(mr.message).toContain("Merge request !3");
  });

  it("429 and rate-limit headers: rate-limited, with the wait", async () => {
    expect(
      await failing(429)
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({ kind: "rate-limited" });
    const retry = (await failing(429, { "retry-after": "120" })
      .getUser()
      .catch((e: unknown) => e)) as Error;
    expect(retry.message).toContain("2 minutes");
    expect(
      await failing(403, { "retry-after": "30" })
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({
      kind: "rate-limited",
    });
    expect(
      await failing(403, { "ratelimit-remaining": "0" })
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({
      kind: "rate-limited",
    });
    expect(
      await failing(403, {}, { message: "Retry later" })
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({ kind: "rate-limited" });
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    expect(
      (
        (await failing(429, { "ratelimit-reset": reset })
          .getUser()
          .catch((e: unknown) => e)) as Error
      ).message,
    ).toMatch(/about (10|11) minutes/);
  });

  it("409: conflict; 400 and 422: invalid, with the server's reason; other statuses: http", async () => {
    expect(
      await failing(409)
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({ kind: "conflict", status: 409 });
    const invalid = (await failing(400, {}, { message: { base: ["Title can't be blank"] } })
      .createReview("g", "p", { title: "", head: "a", base: "b", body: "" })
      .catch((e: unknown) => e)) as Error;
    expect(invalid).toMatchObject({ kind: "invalid", status: 400 });
    expect(invalid.message).toContain("Title can't be blank");
    expect(
      await failing(422)
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({ kind: "invalid", status: 422 });
    expect(
      await failing(500)
        .getUser()
        .catch((e: unknown) => e),
    ).toMatchObject({ kind: "http", status: 500 });
  });

  it("an answer that is not JSON is an http error", async () => {
    const { client } = clientWith(() => new Response("<html>login</html>", { status: 200 }));
    await expect(client.getUser()).rejects.toMatchObject({ kind: "http" });
  });

  it("a network failure names the server and mentions CORS for self-managed servers", async () => {
    const { client } = clientWith(() => {
      throw new TypeError("Failed to fetch");
    });
    const error = (await client.getUser().catch((e: unknown) => e)) as GitProviderError;
    expect(error).toMatchObject({ kind: "network" });
    expect(error.message).toContain("gitlab.example.com");
    expect(error.message).toContain("CORS");
    expect(error.message).toContain("self-managed");
  });

  it("an empty project is told apart only when GitLab says so", async () => {
    const { client } = clientWith((url) =>
      url.pathname.endsWith("/branches/main")
        ? reply({ message: "404 Branch Not Found" }, 404)
        : reply({ empty_repo: false, default_branch: "main" }),
    );
    await expect(client.getBranchHead("g", "p", "main")).rejects.toMatchObject({ kind: "not-found" });
  });

  it("never puts the token in an error message, even when the server repeats it", async () => {
    const scenarios: Array<() => Promise<unknown>> = [
      () => failing(401, {}, { message: `bad ${TOKEN}` }).getUser(),
      () => failing(403, {}, { message: `no ${TOKEN}` }).getFile("g", "p", "main", "a.puml"),
      () =>
        failing(403, {}, { message: TOKEN }).putFile("g", "p", {
          path: "a.puml",
          branch: "m",
          message: "m",
          content: "x",
        }),
      () => failing(404, {}, { message: TOKEN }).getReview("g", "p", 1),
      () => failing(429, {}, { message: TOKEN }).getUser(),
      () => failing(400, {}, { message: `echo ${TOKEN}` }).createBranch("g", "p", "b", id(1)),
      () => failing(500, {}, { message: TOKEN }).getUser(),
      () => failing(409, {}, { message: TOKEN }).getUser(),
      () =>
        clientWith(() => {
          throw new TypeError(`Failed to fetch ${TOKEN}`);
        }).client.getUser(),
    ];
    for (const scenario of scenarios) {
      const error = (await scenario().catch((e: unknown) => e)) as GitProviderError;
      expect(error).toBeInstanceOf(GitProviderError);
      expect(error.message).not.toContain(TOKEN);
      expect(JSON.stringify({ ...error, message: error.message, stack: undefined })).not.toContain(TOKEN);
    }
  });

  it("a branch that already exists is reported by the shared flow, other refusals are passed on", async () => {
    const exists = clientWith(() => reply({ message: "Branch already exists" }, 400));
    await expect(exists.client.createBranch("g", "p", "b", id(1))).rejects.toMatchObject({
      kind: "invalid",
      status: 400,
    });
    const other = clientWith(() => reply({ message: "Invalid reference name" }, 400));
    const error = (await other.client.createBranch("g", "p", "b", id(1)).catch((e: unknown) => e)) as GitProviderError;
    expect(error.kind).toBe("invalid");
    expect(error.status).toBeUndefined();
  });
});

describe("the shared flows against GitLab", () => {
  const input = {
    source: flow.replace("A -> B", "A -> B: hello"),
    body: "## Diagram changes",
    commitMessage: "Update flow.puml",
    branch: "plantuml/flow-20261123",
    title: "Update flow.puml",
  };

  async function opened(fake: ReturnType<typeof fakeGitLab>) {
    const { origin } = await fake.client.openFileFromUrl(LINK);
    fake.calls.length = 0;
    return origin;
  }

  it("proposeChange branches from the head, commits against last_commit_id and opens a merge request", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const origin = await opened(fake);
    const result = await proposeChange(fake.client, origin, input);
    expect(fake.paths()).toEqual([
      "GET /projects/team%2Fsub%2Fdocs/repository/branches/main",
      "POST /projects/team%2Fsub%2Fdocs/repository/branches",
      "POST /projects/team%2Fsub%2Fdocs/repository/commits",
      "POST /projects/team%2Fsub%2Fdocs/merge_requests",
    ]);
    const [action] = fake.calls[2]!.body!.actions as Array<Record<string, unknown>>;
    expect(action).toMatchObject({ action: "update", last_commit_id: origin.version });
    expect(fake.calls[3]!.body).toMatchObject({ source_branch: input.branch, target_branch: "main" });
    expect(result.updated).toBe(false);
    expect(result.pullRequest).toMatchObject({ number: 1, label: "!1" });
    expect(result.origin).toMatchObject({
      provider: "gitlab",
      server: SERVER,
      version: origin.version,
      blob: origin.blob,
    });
    expect(result.origin).not.toHaveProperty("sha");
    expect(result.origin.proposal).toEqual({
      branch: input.branch,
      number: 1,
      htmlUrl: `${SERVER}/team/sub/docs/-/merge_requests/1`,
      version: fake.branches[input.branch]!.head,
    });
  });

  it("proposing again adds a commit to the open merge request and updates its description", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const first = await proposeChange(fake.client, await opened(fake), input);
    fake.calls.length = 0;
    const second = await proposeChange(fake.client, first.origin, {
      ...input,
      source: `${input.source}'more\n`,
      body: "again",
    });
    expect(second.updated).toBe(true);
    expect(fake.paths()).toEqual([
      "GET /projects/team%2Fsub%2Fdocs/merge_requests/1",
      "POST /projects/team%2Fsub%2Fdocs/repository/commits",
      "PUT /projects/team%2Fsub%2Fdocs/merge_requests/1",
    ]);
    const [action] = fake.calls[1]!.body!.actions as Array<Record<string, unknown>>;
    expect(action).toMatchObject({ action: "update", last_commit_id: first.origin.proposal!.version });
    expect(fake.calls[1]!.body!.branch).toBe(input.branch);
    expect(second.origin.proposal!.version).toBe(fake.branches[input.branch]!.head);
    expect(second.origin.proposal!.version).not.toBe(first.origin.proposal!.version);
    expect(fake.merges[1]!.description).toBe("again");
  });

  it("a stale guard is the upstream-changed error, the empty branch is removed, and mergeUpstream merges", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const origin = await opened(fake);
    const upstream = flow.replace("E -> F", "E -> F: upstream");
    fake.commitDirect("main", "docs/flow.puml", upstream);
    const failure = (await proposeChange(fake.client, origin, input).catch((e: unknown) => e)) as UpstreamChangedError;
    expect(failure).toBeInstanceOf(UpstreamChangedError);
    expect(failure).toMatchObject({ kind: "conflict", target: "base", branch: "main" });
    expect(failure.message).toContain("Open the file from GitLab again");
    expect(fake.branches[input.branch]).toBeUndefined();
    expect(fake.paths().at(-1)).toBe("DELETE /projects/team%2Fsub%2Fdocs/repository/branches/plantuml%2Fflow-20261123");

    const merge = await mergeUpstream(fake.client, origin, input.source, failure);
    if (merge.kind !== "merged") throw new Error(`expected a merge, got ${merge.kind}`);
    expect(merge.merged).toBe(input.source.replace("E -> F", "E -> F: upstream"));
    expect(merge.base).toBe(flow);
    const newest = fake.branches.main!.files["docs/flow.puml"]!;
    expect(merge.origin).toMatchObject({ provider: "gitlab", version: newest.commit, blob: newest.blob });
    // The base was read back by its blob.
    expect(fake.paths()).toContain(`GET /projects/team%2Fsub%2Fdocs/repository/blobs/${origin.blob}/raw`);

    const again = await proposeChange(fake.client, merge.origin, { ...input, source: merge.merged });
    expect(again.pullRequest.number).toBe(1);
    expect(fake.branches.main!.files["docs/flow.puml"]!.content).toBe(upstream);
  });

  it("a change on the proposal branch is the upstream-changed error for that branch, merged against the commit it left", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const first = await proposeChange(fake.client, await opened(fake), input);
    fake.commitDirect(input.branch, "docs/flow.puml", input.source.replace("E -> F", "E -> F: reviewer"));
    const local = `${input.source}'local\n`;
    const failure = (await proposeChange(fake.client, first.origin, { ...input, source: local }).catch(
      (e: unknown) => e,
    )) as UpstreamChangedError;
    expect(failure).toMatchObject({ target: "proposal", branch: input.branch, kind: "conflict" });
    fake.calls.length = 0;
    const merge = await mergeUpstream(fake.client, first.origin, local, failure);
    if (merge.kind !== "merged") throw new Error(`expected a merge, got ${merge.kind}`);
    expect(merge.base).toBe(input.source);
    expect(merge.merged).toContain("E -> F: reviewer");
    expect(merge.merged).toContain("'local");
    // The proposal has no blob ID, so its base was read as of the commit.
    expect(fake.calls[1]!.path).toBe("/projects/team%2Fsub%2Fdocs/repository/files/docs%2Fflow.puml/raw");
    expect(merge.origin.proposal!.version).toBe(fake.branches[input.branch]!.files["docs/flow.puml"]!.commit);
    expect(merge.origin.version).toBe(first.origin.version);
  });

  it("a branch name that is taken, and a ref that is not a branch, are explained", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const origin = await opened(fake);
    fake.branches[input.branch] = { head: id(777), files: {} };
    await expect(proposeChange(fake.client, origin, input)).rejects.toThrow(
      `A branch named ${input.branch} already exists. Choose another name.`,
    );
    await expect(proposeChange(fake.client, { ...origin, ref: "v1.0" }, input)).rejects.toThrow(
      "v1.0 is not a branch of team/sub/docs",
    );
  });

  it("proposeNewFile puts a new file in a merge request without a guard", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    const source = "@startuml\nA -> B\n@enduml\n";
    const result = await proposeNewFile(fake.client, {
      owner: "team/sub",
      repo: "docs",
      base: "main",
      path: "docs/new.puml",
      source,
      body: createNewFileMarkdown("docs/new.puml", source),
      commitMessage: "Add new.puml",
      branch: input.branch,
      title: "Add new.puml",
    });
    expect(fake.paths()).toEqual([
      "GET /projects/team%2Fsub%2Fdocs/repository/files/docs%2Fnew.puml",
      "GET /projects/team%2Fsub%2Fdocs/repository/branches/main",
      "POST /projects/team%2Fsub%2Fdocs/repository/branches",
      "POST /projects/team%2Fsub%2Fdocs/repository/commits",
      "POST /projects/team%2Fsub%2Fdocs/merge_requests",
    ]);
    const [action] = fake.calls[3]!.body!.actions as Array<Record<string, unknown>>;
    expect(action).toMatchObject({ action: "create", file_path: "docs/new.puml" });
    expect(action).not.toHaveProperty("last_commit_id");
    const commit = fake.branches[input.branch]!.head;
    expect(result.origin).toEqual(
      createOrigin(fake.client.info, {
        owner: "team/sub",
        repo: "docs",
        ref: "main",
        path: "docs/new.puml",
        version: commit,
        htmlUrl: `${SERVER}/team/sub/docs/-/blob/plantuml/flow-20261123/docs/new.puml`,
        proposal: {
          branch: input.branch,
          number: 1,
          htmlUrl: `${SERVER}/team/sub/docs/-/merge_requests/1`,
          version: commit,
          newFile: true,
        },
      }),
    );
    expect(result.origin.provider).toBe("gitlab");

    // A path that is taken is refused before anything is written.
    fake.calls.length = 0;
    await expect(
      proposeNewFile(fake.client, {
        owner: "team/sub",
        repo: "docs",
        base: "main",
        path: "docs/flow.puml",
        source,
        body: "",
        commitMessage: "m",
        branch: "plantuml/other",
        title: "t",
      }),
    ).rejects.toThrow("already exists on main in team/sub/docs. To change it, use Open from GitLab");
    expect(fake.calls).toHaveLength(1);
  });

  it("in an empty project the new file is refused with empty-repository, and addFirstFile makes the first commit", async () => {
    const fake = fakeGitLab({}, { empty: true });
    const base = {
      owner: "team/sub",
      repo: "docs",
      path: "first.puml",
      source: "@startuml\n@enduml\n",
      commitMessage: "Add first.puml",
    };
    await expect(
      proposeNewFile(fake.client, { ...base, base: "main", body: "", branch: "plantuml/first", title: "t" }),
    ).rejects.toMatchObject({ kind: "empty-repository" });
    const origin = await addFirstFile(fake.client, { ...base, defaultBranch: "main" });
    expect(origin).toMatchObject({
      provider: "gitlab",
      server: SERVER,
      owner: "team/sub",
      repo: "docs",
      ref: "main",
      path: "first.puml",
      version: fake.branches.main!.head,
      htmlUrl: `${SERVER}/team/sub/docs/-/blob/main/first.puml`,
    });
    expect(origin).not.toHaveProperty("blob");
  });

  it("no request in any flow carries the token anywhere but the header", async () => {
    const fake = fakeGitLab({ "docs/flow.puml": flow });
    await proposeChange(fake.client, await opened(fake), input);
    expect(JSON.stringify(fake.calls)).not.toContain(TOKEN);
    for (const [url] of fake.fetchMock.mock.calls) expect(String(url)).not.toContain(TOKEN);
  });
});
