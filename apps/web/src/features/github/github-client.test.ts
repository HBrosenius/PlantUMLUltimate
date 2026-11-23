import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubError, isPlantUmlFileName, MAX_GITHUB_FILE_BYTES } from "./github-client";
import { parseGitHubFileUrl, refPathCandidates } from "./github-url";

const TOKEN = "github_pat_unit_test_token";

const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const fileBody = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "file",
  name: "a.puml",
  path: "docs/a.puml",
  sha: "abc123",
  size: new TextEncoder().encode(text).length,
  encoding: "base64",
  content: b64(text).replace(/(.{60})/g, "$1\n"),
  ...extra,
});

function clientWith(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(new URL(String(input)), init ?? {}),
  );
  return { client: createGitHubClient({ token: TOKEN, fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

describe("GitHub client requests", () => {
  it("sends the GitHub headers and bearer token to api.github.com and nothing else", async () => {
    const { client, fetchMock } = clientWith(() => reply({ login: "octo", name: "Octo Cat" }));
    expect(await client.getUser()).toEqual({ login: "octo", name: "Octo Cat" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.github.com/user");
    expect(init!.headers).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${TOKEN}`,
    });
    expect(init!.credentials).toBe("omit");
  });

  it("pages through repositories sorted by recent push and reports truncation", async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        full_name: `o/r${start + index}`,
        name: `r${start + index}`,
        owner: { login: "o" },
        default_branch: "main",
        private: index % 2 === 0,
        pushed_at: "2026-11-01T00:00:00Z",
        html_url: `https://github.com/o/r${start + index}`,
      }));
    const { client, fetchMock } = clientWith((url) => {
      const number = Number(url.searchParams.get("page"));
      return reply(number === 1 ? page(0, 100) : page(100, 20), {
        headers: { link: number === 1 ? '<https://api.github.com/user/repos?page=2>; rel="next"' : "" },
      });
    });
    const list = await client.listRepositories();
    expect(list.items).toHaveLength(120);
    expect(list.truncated).toBe(false);
    expect(list.items[0]).toMatchObject({ owner: "o", name: "r0", fullName: "o/r0", defaultBranch: "main" });
    const first = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(first.searchParams.get("sort")).toBe("pushed");
    expect(first.searchParams.get("direction")).toBe("desc");
    expect(first.searchParams.get("per_page")).toBe("100");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after ten pages and says the list is truncated", async () => {
    const { client, fetchMock } = clientWith(() =>
      reply([{ name: "b" }], { headers: { link: '<https://api.github.com/x?page=99>; rel="next"' } }),
    );
    const branches = await client.listBranches("o", "r");
    expect(branches.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("lists one folder at a time, folders first, and encodes path and ref", async () => {
    const { client, fetchMock } = clientWith(() =>
      reply([
        { name: "z.puml", path: "my docs/z.puml", type: "file", size: 5 },
        { name: "sub", path: "my docs/sub", type: "dir", size: 0 },
        { name: "a.puml", path: "my docs/a.puml", type: "file", size: 5 },
      ]),
    );
    const entries = await client.listFolder("o", "r", "feature/x", "my docs");
    expect(entries.map((entry) => entry.name)).toEqual(["sub", "a.puml", "z.puml"]);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe("/repos/o/r/contents/my%20docs");
    expect(url.searchParams.get("ref")).toBe("feature/x");
  });
});

describe("GitHub client files", () => {
  it("decodes base64 content as UTF-8, including non-ASCII, and returns the blob sha and size", async () => {
    const text = "@startuml\nAlice -> Bob : Grüße — 日本語 🙂\n@enduml\n";
    const { client } = clientWith(() => reply(fileBody(text)));
    const file = await client.getFile("o", "r", "main", "docs/a.puml");
    expect(file.content).toBe(text);
    expect(file.sha).toBe("abc123");
    expect(file.size).toBe(new TextEncoder().encode(text).length);
    expect(file.name).toBe("a.puml");
  });

  it("refuses files over 1 MB with a clear message, before decoding", async () => {
    const { client } = clientWith(() => reply(fileBody("x", { size: MAX_GITHUB_FILE_BYTES + 1 })));
    await expect(client.getFile("o", "r", "main", "big.puml")).rejects.toMatchObject({
      kind: "too-large",
      message: expect.stringContaining("over 1 MB"),
    });
  });

  it("refuses dot segments, so a crafted path cannot reach another API endpoint", async () => {
    const { client, fetchMock } = clientWith(() => reply(fileBody("x")));
    await expect(client.getFile("o", "r", "main", "docs/../../../user")).rejects.toMatchObject({ kind: "unsupported" });
    await expect(client.listFolder("o", "r", "main", "./docs")).rejects.toMatchObject({ kind: "unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains folders and non-text files", async () => {
    const folder = clientWith(() => reply([{ name: "a", path: "a", type: "file" }]));
    await expect(folder.client.getFile("o", "r", "main", "docs")).rejects.toMatchObject({ kind: "unsupported" });
    const binary = clientWith(() =>
      reply(fileBody("", { content: btoa(String.fromCharCode(0xff, 0xfe, 0xfd)), size: 3 })),
    );
    await expect(binary.client.getFile("o", "r", "main", "x.puml")).rejects.toThrow("not UTF-8 text");
  });
});

describe("GitHub file links", () => {
  it("parses blob, raw and plain links and ignores query and fragment", () => {
    expect(parseGitHubFileUrl("https://github.com/o/r/blob/main/docs/a.puml")).toEqual({
      owner: "o",
      repo: "r",
      segments: ["main", "docs", "a.puml"],
    });
    expect(parseGitHubFileUrl("https://github.com/o/r/blob/main/docs/a.puml?plain=1#L10")?.segments).toEqual([
      "main",
      "docs",
      "a.puml",
    ]);
    expect(parseGitHubFileUrl("https://github.com/o/r/raw/main/a.puml")?.segments).toEqual(["main", "a.puml"]);
    expect(parseGitHubFileUrl("https://raw.githubusercontent.com/o/r/main/docs/a.puml")).toEqual({
      owner: "o",
      repo: "r",
      segments: ["main", "docs", "a.puml"],
    });
    expect(parseGitHubFileUrl("https://raw.githubusercontent.com/o/r/refs/heads/feature/x/a.puml")?.segments).toEqual([
      "feature",
      "x",
      "a.puml",
    ]);
    expect(parseGitHubFileUrl("https://github.com/o/r/blob/main/my%20docs/a.puml")?.segments).toEqual([
      "main",
      "my docs",
      "a.puml",
    ]);
  });

  it("rejects other hosts, folders and non-links", () => {
    expect(parseGitHubFileUrl("https://example.com/o/r/blob/main/a.puml")).toBeUndefined();
    expect(parseGitHubFileUrl("https://github.com/o/r/tree/main/docs")).toBeUndefined();
    expect(parseGitHubFileUrl("https://github.com/o/r")).toBeUndefined();
    expect(parseGitHubFileUrl("not a url")).toBeUndefined();
    expect(parseGitHubFileUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("tries the longest ref first, and a commit sha first of all", () => {
    expect(refPathCandidates(["feature", "x", "a.puml"])).toEqual([
      { ref: "feature/x", path: "a.puml" },
      { ref: "feature", path: "x/a.puml" },
    ]);
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(refPathCandidates(["main", "d", "a.puml"])[0]).toEqual({ ref: "main/d", path: "a.puml" });
    expect(refPathCandidates([sha, "d", "a.puml"])[0]).toEqual({ ref: sha, path: "d/a.puml" });
  });

  it("resolves a branch name that contains a slash", async () => {
    const asked: string[] = [];
    const { client } = clientWith((url) => {
      const ref = url.searchParams.get("ref")!;
      asked.push(`${ref}:${decodeURIComponent(url.pathname.replace("/repos/o/r/contents/", ""))}`);
      return ref === "feature/x"
        ? reply(fileBody("@startuml\n@enduml\n", { path: "docs/a.puml" }))
        : reply({ message: "No commit found for the ref" }, { status: 404 });
    });
    const { file, origin } = await client.openFileFromUrl("https://github.com/o/r/blob/feature/x/docs/a.puml");
    expect(asked[0]).toBe("feature/x/docs:a.puml");
    expect(asked.at(-1)).toBe("feature/x:docs/a.puml");
    expect(file.sha).toBe("abc123");
    expect(origin).toEqual({
      owner: "o",
      repo: "r",
      ref: "feature/x",
      path: "docs/a.puml",
      sha: "abc123",
      htmlUrl: "https://github.com/o/r/blob/feature/x/docs/a.puml",
    });
  });

  it("stops at once on a non-404 failure and reports not-found when no split works", async () => {
    const denied = clientWith(() => reply({ message: "Bad credentials" }, { status: 401 }));
    await expect(denied.client.openFileFromUrl("https://github.com/o/r/blob/main/a.puml")).rejects.toMatchObject({
      kind: "unauthorized",
    });
    expect(denied.fetchMock).toHaveBeenCalledTimes(1);
    const missing = clientWith(() => reply({ message: "Not Found" }, { status: 404 }));
    await expect(missing.client.openFileFromUrl("https://github.com/o/r/blob/a/b/c.puml")).rejects.toMatchObject({
      kind: "not-found",
      message: expect.stringContaining("token cannot see"),
    });
    expect(missing.fetchMock).toHaveBeenCalledTimes(2);
    await expect(missing.client.openFileFromUrl("https://example.com/x")).rejects.toMatchObject({
      kind: "invalid-url",
    });
  });
});

describe("GitHub error messages", () => {
  const failing = (status: number, headers: Record<string, string> = {}, body: unknown = {}) =>
    clientWith(() => reply(body, { status, headers })).client;

  it("401: the token is invalid or expired", async () => {
    await expect(failing(401).getUser()).rejects.toMatchObject({
      kind: "unauthorized",
      message: expect.stringContaining("invalid, expired or revoked"),
    });
  });

  it("403 with no remaining quota is a rate limit and says how long to wait", async () => {
    const soon = String(Math.floor(Date.now() / 1000) + 600);
    await expect(
      failing(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": soon }).getUser(),
    ).rejects.toMatchObject({
      kind: "rate-limited",
      message: expect.stringMatching(/rate limit.*about 10 minutes/),
    });
    await expect(failing(403, { "retry-after": "120" }).getUser()).rejects.toMatchObject({
      kind: "rate-limited",
      message: expect.stringContaining("about 2 minutes"),
    });
    await expect(failing(429).getUser()).rejects.toMatchObject({ kind: "rate-limited" });
    await expect(
      failing(403, {}, { message: "You have exceeded a secondary rate limit" }).getUser(),
    ).rejects.toMatchObject({
      kind: "rate-limited",
    });
  });

  it("403 otherwise means no access and names the permission", async () => {
    await expect(
      failing(403, { "x-ratelimit-remaining": "55" }, { message: "Resource not accessible" }).getUser(),
    ).rejects.toMatchObject({
      kind: "forbidden",
      message: expect.stringContaining("Contents (read)"),
    });
  });

  it("404: not found, or a fine-grained token that cannot see the repository", async () => {
    const error = await failing(404)
      .listBranches("o", "r")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ kind: "not-found", status: 404 });
    expect((error as GitHubError).message).toContain("Fine-grained tokens only reach");
  });

  it("network failures are explained, without echoing the token or the browser's error", async () => {
    const client = createGitHubClient({
      token: TOKEN,
      fetch: (async () => {
        throw new TypeError(`Failed to fetch with ${TOKEN}`);
      }) as unknown as typeof fetch,
    });
    const error = (await client.getUser().catch((caught: unknown) => caught)) as GitHubError;
    expect(error.kind).toBe("network");
    expect(error.message).toContain("Could not reach api.github.com");
    expect(error.message).not.toContain(TOKEN);
  });

  it("other statuses give a generic message without the token", async () => {
    const error = (await failing(500)
      .getUser()
      .catch((caught: unknown) => caught)) as GitHubError;
    expect(error).toMatchObject({ kind: "http", status: 500 });
    expect(error.message).not.toContain(TOKEN);
  });
});

describe("PlantUML file names", () => {
  it("recognises the PlantUML extensions, ignoring case", () => {
    for (const name of ["a.puml", "A.PLANTUML", "b.pu", "c.iuml", "d.wsd"]) expect(isPlantUmlFileName(name)).toBe(true);
    for (const name of ["a.md", "puml", "a.puml.bak", "a.txt"]) expect(isPlantUmlFileName(name)).toBe(false);
  });
});
