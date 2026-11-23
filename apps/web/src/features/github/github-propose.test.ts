import { describe, expect, it, vi } from "vitest";
import { buildReviewGroups } from "../../semantic-review";
import { createGitHubClient, GitHubError } from "./github-client";
import { normalizeGitHubOrigin, type GitHubOrigin } from "./github-origin";
import { createReviewMarkdown, defaultProposalBranch, escapeMarkdown, proposeChange } from "./github-propose";

const TOKEN = "github_pat_unit_test_token";
const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);
const NEW_BLOB = "c".repeat(40);
const NEXT_BLOB = "d".repeat(40);

const origin: GitHubOrigin = {
  owner: "octo",
  repo: "docs",
  ref: "main",
  path: "diagrams/flow.puml",
  sha: BASE,
  htmlUrl: "https://github.com/octo/docs/blob/main/diagrams/flow.puml",
};

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
      case "PUT /repos/octo/docs/contents/diagrams/flow.puml":
        return reply({ content: { sha: call.body!.sha === BASE ? NEW_BLOB : NEXT_BLOB } });
      case "POST /repos/octo/docs/pulls":
        return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" }, 201);
      case "GET /repos/octo/docs/pulls/7":
        return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" });
      case "PATCH /repos/octo/docs/pulls/7":
        return reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "open" });
      case "DELETE /repos/octo/docs/git/refs/heads/plantuml/flow-20261123":
        return new Response(null, { status: 204 });
      default:
        return reply({ message: "Not Found" }, 404);
    }
  });
  return { client: createGitHubClient({ token: TOKEN, fetch: fetchMock as unknown as typeof fetch }), calls };
}

const input = {
  source: "@startuml\nA -> B: hello\n@enduml\n",
  body: "## Diagram changes",
  commitMessage: "Update flow.puml",
  branch: "plantuml/flow-20261123",
  title: "Update flow.puml",
};

describe("proposeChange", () => {
  it("branches from the base branch head, commits against the opened blob and opens the pull request", async () => {
    const { client, calls } = fakeGitHub();
    const result = await proposeChange(client, origin, input);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /repos/octo/docs/git/ref/heads/main",
      "POST /repos/octo/docs/git/refs",
      "PUT /repos/octo/docs/contents/diagrams/flow.puml",
      "POST /repos/octo/docs/pulls",
    ]);
    expect(calls[1]!.body).toEqual({ ref: "refs/heads/plantuml/flow-20261123", sha: HEAD });
    const put = calls[2]!.body!;
    expect(put).toMatchObject({ branch: "plantuml/flow-20261123", sha: BASE, message: "Update flow.puml" });
    expect(new TextDecoder().decode(Uint8Array.from(atob(String(put.content)), (c) => c.charCodeAt(0)))).toBe(
      input.source,
    );
    expect(calls[3]!.body).toEqual({
      title: "Update flow.puml",
      head: "plantuml/flow-20261123",
      base: "main",
      body: "## Diagram changes",
    });
    expect(result.updated).toBe(false);
    expect(result.origin.proposal).toEqual({
      branch: "plantuml/flow-20261123",
      number: 7,
      htmlUrl: "https://github.com/octo/docs/pull/7",
      sha: NEW_BLOB,
    });
    expect(normalizeGitHubOrigin(JSON.parse(JSON.stringify(result.origin)))).toEqual(result.origin);
  });

  it("adds a commit to the tab's open pull request and updates its description", async () => {
    const { client, calls } = fakeGitHub();
    const first = await proposeChange(client, origin, input);
    calls.length = 0;
    const second = await proposeChange(client, first.origin, { ...input, body: "updated", branch: "ignored" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /repos/octo/docs/pulls/7",
      "PUT /repos/octo/docs/contents/diagrams/flow.puml",
      "PATCH /repos/octo/docs/pulls/7",
    ]);
    expect(calls[1]!.body).toMatchObject({ branch: "plantuml/flow-20261123", sha: NEW_BLOB });
    expect(calls[2]!.body).toEqual({ body: "updated" });
    expect(second.updated).toBe(true);
    expect(second.origin.proposal!.sha).toBe(NEXT_BLOB);
  });

  it("opens a new pull request when the earlier one was closed", async () => {
    const closed = () => reply({ number: 7, html_url: "https://github.com/octo/docs/pull/7", state: "closed" });
    const { client, calls } = fakeGitHub({ "GET /repos/octo/docs/pulls/7": closed });
    const withProposal = {
      ...origin,
      proposal: { branch: "plantuml/old", number: 7, htmlUrl: "https://github.com/octo/docs/pull/7", sha: NEW_BLOB },
    };
    const result = await proposeChange(client, withProposal, input);
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET", "POST", "PUT", "POST"]);
    expect(result.updated).toBe(false);
  });

  it("refuses to overwrite a file that changed upstream and removes the empty branch", async () => {
    const { client, calls } = fakeGitHub({
      "PUT /repos/octo/docs/contents/diagrams/flow.puml": () => reply({ message: "does not match" }, 409),
    });
    const failure = await proposeChange(client, origin, input).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GitHubError);
    expect((failure as GitHubError).kind).toBe("conflict");
    expect((failure as GitHubError).message).toContain("changed on main since you opened it");
    expect(calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: "/repos/octo/docs/git/refs/heads/plantuml/flow-20261123",
    });
  });

  it("explains a taken branch name and missing write access", async () => {
    const taken = fakeGitHub({
      "POST /repos/octo/docs/git/refs": () => reply({ message: "Reference already exists" }, 422),
    });
    await expect(proposeChange(taken.client, origin, input)).rejects.toThrow(
      "A branch named plantuml/flow-20261123 already exists",
    );
    const readOnly = fakeGitHub({
      "POST /repos/octo/docs/git/refs": () => reply({ message: "Resource not accessible" }, 403),
    });
    const failure = (await proposeChange(readOnly.client, origin, input).catch((error: unknown) => error)) as Error;
    expect(failure.message).toContain("Contents and Pull requests (read and write)");
    expect(failure.message).not.toContain(TOKEN);
  });

  it("only proposes for files opened from a branch", async () => {
    const { client } = fakeGitHub();
    await expect(proposeChange(client, { ...origin, ref: "v1.0" }, input)).rejects.toThrow(
      "Changes can only be proposed for files opened from a branch",
    );
  });

  it("rejects unsafe branch names before calling GitHub", async () => {
    const { client, calls } = fakeGitHub();
    for (const branch of ["../x", "a..b", "a b", "x.lock", "/x", "a~1", "a:b"]) {
      await expect(proposeChange(client, origin, { ...input, branch })).rejects.toThrow("not a valid branch name");
    }
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });
});

describe("review markdown", () => {
  const left = "@startuml\nAlice -> Bob: hi\n@enduml";
  const right = "@startuml\nAlice -> Bob: hi\nBob -> Carol: <b>hey</b> `x`\n@enduml";

  it("lists the change groups and puts the patch in a collapsed diff block", () => {
    const groups = buildReviewGroups(left, right, "sequence");
    const markdown = createReviewMarkdown("diagrams/flow.puml", left, right, groups);
    expect(markdown).toContain("## Diagram changes");
    expect(markdown).toContain(`${groups.length} change group`);
    expect(markdown).toMatch(/_\((confirmed|probable|unclassified)\)_/);
    expect(markdown).toContain("<details><summary>Source patch</summary>");
    expect(markdown).toContain("```diff\n--- a/diagrams/flow.puml");
    expect(markdown).toContain("+Bob -> Carol: <b>hey</b> `x`");
    expect(markdown).toContain("_Proposed with PlantUML Ultimate._");
    expect(
      markdown
        .split("\n")
        .filter((line) => line.startsWith("- **"))
        .join("\n"),
    ).not.toContain("<b>");
  });

  it("keeps diagram text literal and the patch fence unbreakable", () => {
    expect(escapeMarkdown("<img src=x> *b* [l](javascript:x)\nnext")).toBe(
      "&lt;img src=x&gt; \\*b\\* \\[l\\]\\(javascript:x\\) next",
    );
    const fenced = createReviewMarkdown("a.puml", "x", "y ```` z", []);
    expect(fenced).toContain("`````diff");
  });

  it("cuts a patch that would exceed GitHub's limit", () => {
    const big = Array.from({ length: 20_000 }, (_, index) => `A -> B: line ${index}`).join("\n");
    const markdown = createReviewMarkdown("a.puml", "", big, []);
    expect(markdown.length).toBeLessThan(65_536);
    expect(markdown).toContain("The patch was cut");
  });
});

describe("default proposal branch", () => {
  it("is plantuml/<file>-<yyyymmdd> with a safe file part", () => {
    expect(defaultProposalBranch("Flow Chart (v2).puml", new Date("2026-11-23T10:00:00Z"))).toBe(
      "plantuml/flow-chart-v2-20261123",
    );
    expect(defaultProposalBranch("..puml", new Date("2026-11-23T10:00:00Z"))).toBe("plantuml/diagram-20261123");
  });
});
