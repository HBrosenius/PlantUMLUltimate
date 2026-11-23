import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubError } from "./github-client";
import type { GitHubOrigin } from "./github-origin";
import { proposeChange, UpstreamChangedError } from "./github-propose";
import { mergeUpstream } from "./github-upstream";

const TOKEN = "github_pat_unit_test_token";
const OPENED = "a".repeat(40);
const UPSTREAM = "e".repeat(40);
const LAST = "f".repeat(40);
const HEAD = "b".repeat(40);
const NEW_BLOB = "c".repeat(40);
const BRANCH = "plantuml/flow-20261123";

const lines = ["@startuml", "A -> B", "B -> C", "C -> D", "D -> E", "E -> F", "@enduml", ""];
const withLine = (index: number, text: string) => lines.map((line, at) => (at === index ? text : line)).join("\n");
const OPENED_SOURCE = lines.join("\n");
const LOCAL = withLine(1, "A -> B: hello");
const UPSTREAM_SOURCE = withLine(5, "E -> F: upstream");
const BOTH = LOCAL.replace("E -> F", "E -> F: upstream");
const AGAIN = LOCAL.replace("C -> D", "C -> D: more");

const origin: GitHubOrigin = {
  owner: "octo",
  repo: "docs",
  ref: "main",
  path: "diagrams/flow.puml",
  sha: OPENED,
  htmlUrl: "https://github.com/octo/docs/blob/main/diagrams/flow.puml",
};
const withProposal: GitHubOrigin = {
  ...origin,
  proposal: { branch: BRANCH, number: 7, htmlUrl: "https://github.com/octo/docs/pull/7", sha: NEW_BLOB },
};
const input = { source: LOCAL, body: "body", commitMessage: "Update", branch: BRANCH, title: "Update" };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

type Call = { method: string; path: string; ref: string | null; body: Record<string, unknown> | undefined };

/**
 * `latest` is what GitHub holds now on each branch. A commit is refused with 409 unless it carries the blob sha
 * of that branch's latest version (UPSTREAM on main, LAST on the proposal branch).
 */
function fakeGitHub(latest: { main: string; proposal?: string }, proposalBranchIsTarget = false) {
  const calls: Call[] = [];
  const blobs: Record<string, string> = { [OPENED]: OPENED_SOURCE, [NEW_BLOB]: LOCAL, [UPSTREAM]: OPENED_SOURCE };
  const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(request));
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const call: Call = {
      method: init!.method ?? "GET",
      path: url.pathname,
      ref: url.searchParams.get("ref"),
      body: init!.body ? (JSON.parse(String(init!.body)) as Record<string, unknown>) : undefined,
    };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    if (key === "GET /repos/octo/docs/git/ref/heads/main")
      return reply({ ref: "refs/heads/main", object: { sha: HEAD } });
    if (key === "POST /repos/octo/docs/git/refs") return reply({ ref: call.body!.ref }, 201);
    if (key === `DELETE /repos/octo/docs/git/refs/heads/${BRANCH}`) return new Response(null, { status: 204 });
    if (key === "GET /repos/octo/docs/pulls/7" || key === "PATCH /repos/octo/docs/pulls/7")
      return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" });
    if (key === "POST /repos/octo/docs/pulls")
      return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" }, 201);
    if (key === "GET /repos/octo/docs/contents/diagrams/flow.puml") {
      const onProposal = call.ref === BRANCH;
      const content = onProposal ? latest.proposal! : latest.main;
      return reply({
        type: "file",
        name: "flow.puml",
        path: "diagrams/flow.puml",
        sha: onProposal ? LAST : UPSTREAM,
        size: content.length,
        encoding: "base64",
        content: b64(content),
      });
    }
    const blob = /^GET \/repos\/octo\/docs\/git\/blobs\/(\w+)$/.exec(key)?.[1];
    if (blob && blobs[blob] !== undefined) return reply({ sha: blob, encoding: "base64", content: b64(blobs[blob]!) });
    if (key === "PUT /repos/octo/docs/contents/diagrams/flow.puml") {
      const expected = proposalBranchIsTarget ? LAST : UPSTREAM;
      return call.body!.sha === expected
        ? reply({ content: { sha: "9".repeat(40) } })
        : reply({ message: "does not match" }, 409);
    }
    return reply({ message: "Not Found" }, 404);
  });
  return { client: createGitHubClient({ token: TOKEN, fetch: fetchMock as unknown as typeof fetch }), calls };
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(UpstreamChangedError);
  return error as UpstreamChangedError;
}

describe("merging upstream changes", () => {
  it("merges cleanly into a new proposal and retries against the upstream blob", async () => {
    const { client, calls } = fakeGitHub({ main: UPSTREAM_SOURCE });
    const changed = await failure(proposeChange(client, origin, input));
    expect(changed).toMatchObject({ kind: "conflict", target: "base", branch: "main" });
    expect(calls.at(-1)!.method).toBe("DELETE");

    const merge = await mergeUpstream(client, origin, LOCAL, changed);
    if (merge.kind !== "merged") throw new Error(`expected a clean merge, got ${merge.kind}`);
    expect(merge.merged).toBe(BOTH);
    expect(merge.upstream).toBe(UPSTREAM_SOURCE);
    expect(merge.base).toBe(OPENED_SOURCE);
    expect(merge.origin.sha).toBe(UPSTREAM);
    expect(merge.nothingToPropose).toBe(false);
    // Reading the newer version wrote nothing.
    expect(calls.filter((call) => call.method !== "GET").map((call) => call.method)).toEqual(["POST", "PUT", "DELETE"]);

    calls.length = 0;
    const result = await proposeChange(client, merge.origin, { ...input, source: merge.merged });
    expect(result.updated).toBe(false);
    const put = calls.find((call) => call.method === "PUT")!;
    expect(put.body).toMatchObject({ sha: UPSTREAM, branch: BRANCH });
    expect(Buffer.from(String(put.body!.content), "base64").toString("utf8")).toBe(BOTH);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/repos/octo/docs/pulls" });
  });

  it("merges cleanly when adding a commit and moves the proposal sha", async () => {
    const { client, calls } = fakeGitHub({ main: UPSTREAM_SOURCE, proposal: BOTH }, true);
    const changed = await failure(proposeChange(client, withProposal, { ...input, source: AGAIN }));
    expect(changed).toMatchObject({ target: "proposal", branch: BRANCH });
    expect(changed.message).toContain("since your last proposal");

    const merge = await mergeUpstream(client, withProposal, AGAIN, changed);
    if (merge.kind !== "merged") throw new Error(`expected a clean merge, got ${merge.kind}`);
    // The merge base is the content last proposed, read from the blob at proposal.sha.
    expect(merge.base).toBe(LOCAL);
    expect(merge.merged).toBe(BOTH.replace("C -> D", "C -> D: more"));
    expect(calls.some((call) => call.path.endsWith(`/git/blobs/${NEW_BLOB}`))).toBe(true);
    expect(calls.some((call) => call.path.endsWith("/contents/diagrams/flow.puml") && call.ref === BRANCH)).toBe(true);
    expect(merge.origin.sha).toBe(OPENED);
    expect(merge.origin.proposal!.sha).toBe(LAST);

    calls.length = 0;
    const result = await proposeChange(client, merge.origin, { ...input, source: merge.merged });
    expect(result.updated).toBe(true);
    expect(calls.find((call) => call.method === "PUT")!.body).toMatchObject({ sha: LAST, branch: BRANCH });
  });

  it("reports a real conflict with line ranges and commits nothing", async () => {
    const { client, calls } = fakeGitHub({ main: withLine(1, "A -> B: upstream wording") });
    const changed = await failure(proposeChange(client, origin, input));
    const merge = await mergeUpstream(client, origin, LOCAL, changed);
    expect(merge).toEqual({ kind: "conflict", branch: "main", regions: ["line 2"] });
    // The only commit attempt was the refused one; the empty branch was removed and no pull request opened.
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1);
    expect(calls.some((call) => call.path.endsWith("/pulls"))).toBe(false);
  });

  it("keeps the original error when the file is not actually newer", async () => {
    const { client } = fakeGitHub({ main: OPENED_SOURCE });
    // GitHub reports the blob it holds as UPSTREAM, which is already the tab's base.
    const merge = await mergeUpstream(client, { ...origin, sha: UPSTREAM }, LOCAL, { target: "base", branch: "main" });
    expect(merge).toEqual({ kind: "unchanged" });
  });

  it("flags a merge that adds nothing to what GitHub already has", async () => {
    const { client } = fakeGitHub({ main: LOCAL });
    const merge = await mergeUpstream(client, origin, LOCAL, { target: "base", branch: "main" });
    expect(merge).toMatchObject({ kind: "merged", nothingToPropose: true });
  });

  it("never exposes the token in the errors", async () => {
    const { client } = fakeGitHub({ main: UPSTREAM_SOURCE });
    const changed = await failure(proposeChange(client, origin, input));
    expect(changed).toBeInstanceOf(GitHubError);
    expect(changed.message).not.toContain(TOKEN);
  });
});
