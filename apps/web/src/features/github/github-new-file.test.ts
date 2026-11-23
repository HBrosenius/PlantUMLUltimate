import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubError } from "./github-client";
import {
  addFirstFile,
  createNewFileMarkdown,
  defaultNewFilePath,
  proposeNewFile,
  validateNewFilePath,
  type ProposeNewFileInput,
} from "./github-new-file";
import { normalizeGitHubOrigin } from "./github-origin";
import { proposeChange } from "./github-propose";

const TOKEN = "github_pat_unit_test_token";
const HEAD = "b".repeat(40);
const NEW_BLOB = "c".repeat(40);
const NEXT_BLOB = "d".repeat(40);
const BRANCH = "plantuml/new-20261123";
const FILE = "/repos/octo/docs/contents/docs/new.puml";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { method: string; path: string; body: Record<string, unknown> | undefined };

function fakeGitHub(overrides: Partial<Record<string, (call: Call) => Response>> = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.github.com");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const call: Call = {
      method: init!.method ?? "GET",
      path: url.pathname,
      body: init!.body ? (JSON.parse(String(init!.body)) as Record<string, unknown>) : undefined,
    };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const override = overrides[key];
    if (override) return override(call);
    switch (key) {
      case "GET /repos/octo/docs/git/ref/heads/main":
        return reply({ ref: "refs/heads/main", object: { sha: HEAD, type: "commit" } });
      case "POST /repos/octo/docs/git/refs":
        return reply({ ref: call.body!.ref }, 201);
      case `PUT ${FILE}`:
        return reply({ content: { sha: call.body!.sha === undefined ? NEW_BLOB : NEXT_BLOB } });
      case "POST /repos/octo/docs/pulls":
        return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" }, 201);
      case "GET /repos/octo/docs/pulls/7":
      case "PATCH /repos/octo/docs/pulls/7":
        return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" });
      case `DELETE /repos/octo/docs/git/refs/heads/${BRANCH}`:
        return new Response(null, { status: 204 });
      default:
        return reply({ message: "Not Found" }, 404);
    }
  });
  return { client: createGitHubClient({ token: TOKEN, fetch: fetchMock as unknown as typeof fetch }), calls };
}

const source = "@startuml\nAlice -> Bob: hello\n@enduml\n";
const input: ProposeNewFileInput = {
  owner: "octo",
  repo: "docs",
  base: "main",
  path: "docs/new.puml",
  source,
  body: "## New diagram file",
  commitMessage: "Add new.puml",
  branch: BRANCH,
  title: "Add new.puml",
};
const decode = (content: unknown) =>
  new TextDecoder().decode(Uint8Array.from(atob(String(content)), (c) => c.charCodeAt(0)));

describe("proposeNewFile", () => {
  it("checks the path, branches from the base head, commits without a sha and opens the pull request", async () => {
    const { client, calls } = fakeGitHub();
    const result = await proposeNewFile(client, input);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${FILE}`,
      "GET /repos/octo/docs/git/ref/heads/main",
      "POST /repos/octo/docs/git/refs",
      `PUT ${FILE}`,
      "POST /repos/octo/docs/pulls",
    ]);
    expect(calls[2]!.body).toEqual({ ref: `refs/heads/${BRANCH}`, sha: HEAD });
    const put = calls[3]!.body!;
    expect(put).not.toHaveProperty("sha");
    expect(put).toMatchObject({ branch: BRANCH, message: "Add new.puml" });
    expect(decode(put.content)).toBe(source);
    expect(calls[4]!.body).toEqual({ title: "Add new.puml", head: BRANCH, base: "main", body: "## New diagram file" });
    expect(result.pullRequest.number).toBe(7);
    expect(result.origin).toEqual({
      owner: "octo",
      repo: "docs",
      ref: "main",
      path: "docs/new.puml",
      sha: NEW_BLOB,
      htmlUrl: `https://github.com/octo/docs/blob/${BRANCH}/docs/new.puml`,
      proposal: {
        branch: BRANCH,
        number: 7,
        htmlUrl: "https://github.com/octo/docs/pull/7",
        sha: NEW_BLOB,
        newFile: true,
      },
    });
    expect(normalizeGitHubOrigin(JSON.parse(JSON.stringify(result.origin)))).toEqual(result.origin);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it("then adds commits to the same pull request through proposeChange", async () => {
    const { client, calls } = fakeGitHub();
    const { origin } = await proposeNewFile(client, input);
    calls.length = 0;
    const next = await proposeChange(client, origin, {
      source: `${source}\n`,
      body: "updated",
      commitMessage: "More",
      branch: "ignored",
      title: "ignored",
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /repos/octo/docs/pulls/7",
      `PUT ${FILE}`,
      "PATCH /repos/octo/docs/pulls/7",
    ]);
    expect(calls[1]!.body).toMatchObject({ branch: BRANCH, sha: NEW_BLOB });
    expect(next.updated).toBe(true);
    expect(next.origin.proposal).toMatchObject({ sha: NEXT_BLOB, newFile: true });
  });

  it("rejects bad paths before calling GitHub", async () => {
    const { client, calls } = fakeGitHub();
    for (const path of ["/docs/new.puml", "docs/../new.puml", "./new.puml", "docs/new.md", "", "docs//new.puml"])
      await expect(proposeNewFile(client, { ...input, path })).rejects.toBeInstanceOf(GitHubError);
    expect(calls).toEqual([]);
  });

  it("refuses a path that already exists on the base branch and points to Open from GitHub", async () => {
    const { client, calls } = fakeGitHub({
      [`GET ${FILE}`]: () =>
        reply({
          type: "file",
          name: "new.puml",
          path: "docs/new.puml",
          sha: "e".repeat(40),
          size: 3,
          encoding: "base64",
          content: btoa("abc"),
        }),
    });
    const failure = (await proposeNewFile(client, input).catch((error: unknown) => error)) as Error;
    expect(failure.message).toContain("already exists on main");
    expect(failure.message).toContain("Open from GitHub");
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("removes the branch again when the commit or the pull request fails", async () => {
    for (const key of [`PUT ${FILE}`, "POST /repos/octo/docs/pulls"]) {
      const { client, calls } = fakeGitHub({ [key]: () => reply({ message: "boom" }, 500) });
      await expect(proposeNewFile(client, input)).rejects.toBeInstanceOf(GitHubError);
      expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: `/repos/octo/docs/git/refs/heads/${BRANCH}` });
    }
  });

  it("explains a taken branch name and does not delete a branch it did not create", async () => {
    const { client, calls } = fakeGitHub({
      "POST /repos/octo/docs/git/refs": () => reply({ message: "Reference already exists" }, 422),
    });
    await expect(proposeNewFile(client, input)).rejects.toThrow(`A branch named ${BRANCH} already exists`);
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("explains missing write access without exposing the token", async () => {
    const { client, calls } = fakeGitHub({
      "POST /repos/octo/docs/git/refs": () => reply({ message: "Resource not accessible" }, 403),
    });
    const failure = (await proposeNewFile(client, input).catch((error: unknown) => error)) as GitHubError;
    expect(failure.kind).toBe("forbidden");
    expect(failure.message).toContain("Contents and Pull requests (read and write)");
    expect(failure.message).not.toContain(TOKEN);
    expect(calls.some((call) => call.method === "PUT" || call.method === "DELETE")).toBe(false);
  });

  it("reports a base that is not a branch", async () => {
    const { client } = fakeGitHub();
    await expect(proposeNewFile(client, { ...input, base: "v1" })).rejects.toThrow("v1 is not a branch");
  });
});

describe("proposing again after the new-file pull request was closed", () => {
  const closed = (merged: boolean) => () =>
    reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "closed", merged });
  const next = {
    source: `${source}\n`,
    body: "update",
    commitMessage: "Update new.puml",
    branch: "plantuml/new-again",
    title: "Update new.puml",
  };

  it("when merged, the file is on the base branch and its blob guards the commit", async () => {
    const created = fakeGitHub();
    const { origin } = await proposeNewFile(created.client, input);
    const { client, calls } = fakeGitHub({
      "GET /repos/octo/docs/pulls/7": closed(true),
      [`GET ${FILE}`]: () =>
        reply({
          type: "file",
          name: "new.puml",
          path: "docs/new.puml",
          sha: NEW_BLOB,
          size: source.length,
          encoding: "base64",
          content: btoa(source),
        }),
    });
    const result = await proposeChange(client, origin, next);
    expect(result.updated).toBe(false);
    expect(calls.find((call) => call.method === "PUT")!.body).toMatchObject({ sha: NEW_BLOB, branch: next.branch });
    expect(result.origin.proposal).toMatchObject({ number: 7, newFile: true });
  });

  it("when closed unmerged, the file is gone from the base branch, so it is added again without a sha", async () => {
    const created = fakeGitHub();
    const { origin } = await proposeNewFile(created.client, input);
    const { client, calls } = fakeGitHub({ "GET /repos/octo/docs/pulls/7": closed(false) });
    const result = await proposeChange(client, origin, next);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /repos/octo/docs/pulls/7",
      `GET ${FILE}`,
      "GET /repos/octo/docs/git/ref/heads/main",
      "POST /repos/octo/docs/git/refs",
      `PUT ${FILE}`,
      "POST /repos/octo/docs/pulls",
    ]);
    expect(calls.find((call) => call.method === "PUT")!.body).not.toHaveProperty("sha");
    expect(result.origin.proposal).toMatchObject({ branch: next.branch, sha: NEW_BLOB, newFile: true });
  });
});

describe("new file path", () => {
  it("accepts folders and every PlantUML extension", () => {
    for (const path of ["flow.puml", "docs/flow.puml", "a/b/c.PLANTUML", "x.pu", "x.iuml", "x.wsd"])
      expect(validateNewFilePath(path)).toBeUndefined();
  });

  it("explains what is wrong", () => {
    expect(validateNewFilePath("")).toContain("Enter a file path");
    expect(validateNewFilePath("/flow.puml")).toContain("slash at the start");
    expect(validateNewFilePath("docs/")).toContain("must end with a file name");
    expect(validateNewFilePath("a//b.puml")).toContain("empty folder name");
    expect(validateNewFilePath("a/./b.puml")).toContain("cannot contain . or ..");
    expect(validateNewFilePath("../b.puml")).toContain("cannot contain . or ..");
    expect(validateNewFilePath("a\\b.puml")).toContain("Use /");
    expect(validateNewFilePath("docs/flow.md")).toContain("PlantUML extension");
    expect(validateNewFilePath("docs/flow")).toContain("PlantUML extension");
  });

  it("defaults to the tab's file name with a PlantUML extension", () => {
    expect(defaultNewFilePath("flow.puml")).toBe("flow.puml");
    expect(defaultNewFilePath("notes.txt")).toBe("notes.puml");
    expect(defaultNewFilePath("Untitled diagram")).toBe("Untitled diagram.puml");
    expect(defaultNewFilePath("a/b.wsd")).toBe("a b.wsd");
    expect(defaultNewFilePath("")).toBe("diagram.puml");
    expect(validateNewFilePath(defaultNewFilePath("Untitled diagram"))).toBeUndefined();
  });
});

describe("new file description", () => {
  it("is a short note with the source in a collapsed block that cannot be closed early", () => {
    const markdown = createNewFileMarkdown("docs/new.puml", "@startuml\nnote: ```` x\n@enduml\n");
    expect(markdown).toContain("## New diagram file");
    expect(markdown).toContain("Adds `docs/new.puml` (3 lines).");
    expect(markdown).toContain("<details><summary>Source</summary>");
    expect(markdown).toContain("`````plantuml\n@startuml");
    expect(markdown).toContain("_Proposed with PlantUML Ultimate._");
    expect(markdown).not.toContain("change group");
  });

  it("cuts a source that would exceed GitHub's limit", () => {
    const big = Array.from({ length: 20_000 }, (_, index) => `A -> B: line ${index}`).join("\n");
    const markdown = createNewFileMarkdown("a.puml", big);
    expect(markdown.length).toBeLessThan(65_536);
    expect(markdown).toContain("The source was cut");
  });
});

describe("an empty repository", () => {
  const empty = {
    "GET /repos/octo/docs/git/ref/heads/main": () => reply({ message: "Git Repository is empty.", status: "409" }, 409),
    [`GET ${FILE}`]: () => reply({ message: "This repository is empty." }, 404),
  };

  it("is reported as empty, not as a changed branch, and nothing is written", async () => {
    const { client, calls } = fakeGitHub(empty);
    const failure = (await proposeNewFile(client, input).catch((error: unknown) => error)) as GitHubError;
    expect(failure).toBeInstanceOf(GitHubError);
    expect(failure.kind).toBe("empty-repository");
    expect(failure.message).toContain("The repository is empty");
    expect(failure.message).not.toContain("changed");
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("gets the file as its first commit on the default branch, with no branch or sha in the commit", async () => {
    const { client, calls } = fakeGitHub(empty);
    const origin = await addFirstFile(client, {
      owner: "octo",
      repo: "docs",
      defaultBranch: "main",
      path: "docs/new.puml",
      source,
      commitMessage: "Add new.puml",
    });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`PUT ${FILE}`]);
    expect(calls[0]!.body).toEqual({ message: "Add new.puml", content: expect.any(String) });
    expect(decode(calls[0]!.body!.content)).toBe(source);
    expect(origin).toEqual({
      owner: "octo",
      repo: "docs",
      ref: "main",
      path: "docs/new.puml",
      sha: NEW_BLOB,
      htmlUrl: "https://github.com/octo/docs/blob/main/docs/new.puml",
    });
    expect(normalizeGitHubOrigin(origin)).toEqual(origin);
  });

  it("checks the path before the first commit", async () => {
    const { client, calls } = fakeGitHub(empty);
    await expect(
      addFirstFile(client, {
        owner: "octo",
        repo: "docs",
        defaultBranch: "main",
        path: "../x.puml",
        source,
        commitMessage: "x",
      }),
    ).rejects.toThrow(". or ..");
    expect(calls).toEqual([]);
  });
});
