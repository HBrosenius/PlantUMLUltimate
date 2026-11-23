import { describe, expect, it } from "vitest";
import {
  createOrigin,
  createProposal,
  isSafeOriginLink,
  normalizeGitOrigin,
  normalizeServer,
  originProvider,
  originServer,
  originVersion,
  proposalVersion,
  withOriginVersion,
  withProposalVersion,
} from "./git-origin";
import { GitProviderError } from "./git-provider";
import { GitHubError } from "../github/github-client";

/** A record exactly as saved before GitLab support: no provider, no server, the guard in `sha`. */
const STORED_TODAY = {
  owner: "octo",
  repo: "docs",
  ref: "main",
  path: "diagrams/flow.puml",
  sha: "a".repeat(40),
  htmlUrl: "https://github.com/octo/docs/blob/main/diagrams/flow.puml",
  proposal: {
    branch: "plantuml/flow-20261123",
    number: 7,
    htmlUrl: "https://github.com/octo/docs/pull/7",
    sha: "c".repeat(40),
    newFile: true as const,
  },
};

const GITLAB = {
  provider: "gitlab",
  server: "https://gitlab.example.com",
  owner: "team/sub",
  repo: "docs",
  ref: "main",
  path: "diagrams/flow.puml",
  version: "d".repeat(40),
  blob: "e".repeat(40),
  htmlUrl: "https://gitlab.example.com/team/sub/docs/-/blob/main/diagrams/flow.puml",
  proposal: {
    branch: "plantuml/flow-20261123",
    number: 12,
    htmlUrl: "https://gitlab.example.com/team/sub/docs/-/merge_requests/12",
    version: "f".repeat(40),
  },
};

describe("a stored GitHub origin from before GitLab support", () => {
  it("reads as GitHub and comes back unchanged", () => {
    const origin = normalizeGitOrigin(JSON.parse(JSON.stringify(STORED_TODAY)));
    expect(origin).toEqual(STORED_TODAY);
    expect(origin).not.toHaveProperty("provider");
    expect(originProvider(origin!)).toBe("github");
    expect(originServer(origin!)).toBe("https://github.com");
    expect(originVersion(origin!)).toBe("a".repeat(40));
    expect(proposalVersion(origin!.proposal!)).toBe("c".repeat(40));
  });

  it("still drops records that are incomplete or point away from github.com", () => {
    expect(normalizeGitOrigin({ owner: "x" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...STORED_TODAY, sha: undefined })).toBeUndefined();
    expect(normalizeGitOrigin({ ...STORED_TODAY, htmlUrl: "javascript:alert(1)" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...STORED_TODAY, htmlUrl: "https://evil.example/octo/docs" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...STORED_TODAY, htmlUrl: "http://github.com/octo/docs" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...STORED_TODAY, server: "https://gitlab.example.com" })).toBeUndefined();
    expect(
      normalizeGitOrigin({ ...STORED_TODAY, proposal: { ...STORED_TODAY.proposal, htmlUrl: "https://x.example/p/1" } }),
    ).toEqual({ ...STORED_TODAY, proposal: undefined });
  });

  it("accepts a record that names GitHub and uses the neutral version, and stores it the old way", () => {
    const { sha, ...rest } = STORED_TODAY;
    expect(normalizeGitOrigin({ ...rest, provider: "github", server: "https://github.com", version: sha })).toEqual({
      ...STORED_TODAY,
      proposal: STORED_TODAY.proposal,
    });
  });
});

describe("a GitLab origin", () => {
  it("round-trips with its provider, server, version and blob", () => {
    expect(normalizeGitOrigin(JSON.parse(JSON.stringify(GITLAB)))).toEqual(GITLAB);
  });

  it("needs https on its own server, in the origin and the proposal", () => {
    expect(normalizeGitOrigin({ ...GITLAB, server: "http://gitlab.example.com" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...GITLAB, server: "https://gitlab.example.com/sub" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...GITLAB, server: undefined })).toBeUndefined();
    expect(normalizeGitOrigin({ ...GITLAB, version: undefined })).toBeUndefined();
    expect(normalizeGitOrigin({ ...GITLAB, htmlUrl: "https://github.com/team/docs" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...GITLAB, htmlUrl: "https://gitlab.example.com.evil.test/x" })).toBeUndefined();
    expect(normalizeGitOrigin({ ...GITLAB, provider: "bitbucket" })).toBeUndefined();
    expect(
      normalizeGitOrigin({ ...GITLAB, proposal: { ...GITLAB.proposal, htmlUrl: "https://github.com/o/r/pull/1" } })
        ?.proposal,
    ).toBeUndefined();
  });

  it("links only to its own server over https", () => {
    const origin = normalizeGitOrigin(GITLAB)!;
    expect(isSafeOriginLink(origin, "https://gitlab.example.com/a/b")).toBe(true);
    expect(isSafeOriginLink(origin, "http://gitlab.example.com/a/b")).toBe(false);
    expect(isSafeOriginLink(origin, "https://gitlab.com/a/b")).toBe(false);
    expect(isSafeOriginLink(origin, "javascript:alert(1)")).toBe(false);
    expect(isSafeOriginLink(STORED_TODAY, "https://github.com/a/b")).toBe(true);
    expect(isSafeOriginLink(STORED_TODAY, "https://gitlab.example.com/a/b")).toBe(false);
  });
});

describe("the guard", () => {
  it("is written to the field of the provider: sha for GitHub, version for GitLab", () => {
    const github = withOriginVersion(STORED_TODAY, "1".repeat(40));
    expect(github.sha).toBe("1".repeat(40));
    expect(github).not.toHaveProperty("version");
    const gitlab = withOriginVersion(normalizeGitOrigin(GITLAB)!, "2".repeat(40), "3".repeat(40));
    expect(gitlab).toMatchObject({ version: "2".repeat(40), blob: "3".repeat(40) });
    expect(gitlab).not.toHaveProperty("sha");
    expect(withOriginVersion(normalizeGitOrigin(GITLAB)!, "2".repeat(40))).not.toHaveProperty("blob");
    expect(withProposalVersion("gitlab", GITLAB.proposal, "4".repeat(40)).version).toBe("4".repeat(40));
    expect(withProposalVersion("github", STORED_TODAY.proposal, "4".repeat(40))).toMatchObject({ sha: "4".repeat(40) });
  });

  it("builds new origins the old way for GitHub and with provider and server for GitLab", () => {
    const fields = {
      owner: "o",
      repo: "r",
      ref: "main",
      path: "a.puml",
      version: "5".repeat(40),
      htmlUrl: "https://x",
    };
    expect(createOrigin({ id: "github", server: "https://github.com" }, fields)).toEqual({
      owner: "o",
      repo: "r",
      ref: "main",
      path: "a.puml",
      sha: "5".repeat(40),
      htmlUrl: "https://x",
    });
    expect(
      createOrigin({ id: "gitlab", server: "https://gitlab.com" }, { ...fields, blob: "6".repeat(40) }),
    ).toMatchObject({
      provider: "gitlab",
      server: "https://gitlab.com",
      version: "5".repeat(40),
      blob: "6".repeat(40),
    });
    expect(createProposal({ id: "gitlab" }, { branch: "b", number: 1, htmlUrl: "https://x", version: "7" })).toEqual({
      branch: "b",
      number: 1,
      htmlUrl: "https://x",
      version: "7",
    });
  });
});

describe("normalizeServer", () => {
  it("keeps only the origin of an https address", () => {
    expect(normalizeServer(" https://GitLab.Example.com/ ")).toBe("https://gitlab.example.com");
    expect(normalizeServer("https://gitlab.example.com:8443")).toBe("https://gitlab.example.com:8443");
    for (const bad of [
      "http://gitlab.com",
      "gitlab.com",
      "https://user:pw@gitlab.com",
      "https://gitlab.com/sub",
      "https://gitlab.com/?x=1",
      "ftp://gitlab.com",
      "",
    ])
      expect(normalizeServer(bad), bad).toBeUndefined();
  });
});

describe("GitHubError", () => {
  it("is the shared provider error under its old name", () => {
    expect(new GitHubError("conflict", "x")).toBeInstanceOf(GitProviderError);
    expect(new GitProviderError("conflict", "x")).toBeInstanceOf(GitHubError);
  });
});
