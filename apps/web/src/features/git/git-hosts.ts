import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createGitHubProvider, githubHasToken, loadGitHubToken, subscribeGitHubToken } from "../github/github-host";
import { originProvider, originServer, type GitOrigin } from "./git-origin";
import { GitProviderError, type GitProvider, type GitProviderId } from "./git-provider";
import { createGitLabClient } from "./gitlab-client";
import {
  DEFAULT_GITLAB_SERVER,
  getGitLabToken,
  getGitLabState,
  gitLabHasToken,
  loadRememberedGitLabTokens,
  subscribeGitLab,
} from "./gitlab-settings";

/**
 * Which Git host a dialog talks to, and how to get a client for it. The dialogs are written once against
 * `GitProvider`; this is the only place that knows which token store and which client a host needs.
 */
export type GitHostTarget = { provider: "github" } | { provider: "gitlab"; server: string };

export const GITHUB_TARGET: GitHostTarget = { provider: "github" };

export const gitLabTarget = (server: string = DEFAULT_GITLAB_SERVER): GitHostTarget => ({ provider: "gitlab", server });

/** The host a tab's origin lives on. A record without a provider is GitHub. */
export const targetOfOrigin = (origin: GitOrigin): GitHostTarget =>
  originProvider(origin) === "gitlab" ? gitLabTarget(originServer(origin)) : GITHUB_TARGET;

export const targetKey = (target: GitHostTarget): string =>
  target.provider === "gitlab" ? `gitlab:${target.server}` : "github";

/** The words each host uses. Matches `GitProvider.info`, but is known before a token (and so a client) exists. */
export interface GitWording {
  id: GitProviderId;
  /** "GitHub" or "GitLab". */
  name: string;
  /** "pull request" or "merge request". */
  reviewName: string;
  /** "Pull request" or "Merge request". */
  reviewTitle: string;
  /** "#" or "!": how the host writes a request's number. */
  numberSign: string;
  /** "repository" or "project", and the plural. */
  repository: string;
  repositories: string;
  /** What kind of token to add, in a sentence. */
  tokenAdvice: { read: string; write: string };
}

const WORDING: Record<GitProviderId, GitWording> = {
  github: {
    id: "github",
    name: "GitHub",
    reviewName: "pull request",
    reviewTitle: "Pull request",
    numberSign: "#",
    repository: "repository",
    repositories: "repositories",
    tokenAdvice: {
      read: "add a fine-grained personal access token with read access to your repositories",
      write: "add a fine-grained personal access token with Contents and Pull requests set to Read and write",
    },
  },
  gitlab: {
    id: "gitlab",
    name: "GitLab",
    reviewName: "merge request",
    reviewTitle: "Merge request",
    numberSign: "!",
    repository: "project",
    repositories: "projects",
    tokenAdvice: {
      read: "add a GitLab token with the api scope (a project access token is the narrower choice)",
      write:
        "add a GitLab token with the api scope (a project access token with the Developer role is the narrower choice)",
    },
  },
};

export const wordingFor = (provider: GitProviderId): GitWording => WORDING[provider];

/** "PR #12" or "MR !12". */
export const reviewBadge = (provider: GitProviderId, number: number): string =>
  `${provider === "gitlab" ? "MR" : "PR"} ${WORDING[provider].numberSign}${number}`;

/** "pull request #12" or "merge request !12". */
export const reviewName = (provider: GitProviderId, number: number): string =>
  `${WORDING[provider].reviewName} ${WORDING[provider].numberSign}${number}`;

function hasTokenFor(target: GitHostTarget): boolean {
  return target.provider === "gitlab" ? gitLabHasToken(target.server) : githubHasToken();
}

function loadTokenFor(target: GitHostTarget): Promise<void> {
  return target.provider === "gitlab" ? loadRememberedGitLabTokens() : loadGitHubToken();
}

function subscribeAny(listener: () => void): () => void {
  const github = subscribeGitHubToken(listener);
  const gitlab = subscribeGitLab(listener);
  return () => {
    github();
    gitlab();
  };
}

/** A client for the host, or undefined when there is no token for it. The token is read here and nowhere else. */
export function createProviderFor(target: GitHostTarget, fetchImpl?: typeof fetch): GitProvider | undefined {
  if (target.provider === "github") return createGitHubProvider(fetchImpl);
  const token = getGitLabToken(target.server);
  if (!token) return undefined;
  try {
    return createGitLabClient({ server: target.server, token, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  } catch {
    return undefined;
  }
}

/** Like `createProviderFor`, but loads a remembered token first and explains what is missing. */
export async function providerForTarget(target: GitHostTarget, fetchImpl?: typeof fetch): Promise<GitProvider> {
  await loadTokenFor(target);
  const provider = createProviderFor(target, fetchImpl);
  if (provider) return provider;
  throw new GitProviderError(
    "unauthorized",
    target.provider === "gitlab"
      ? `There is no GitLab token for ${new URL(target.server).host}. Add one in Settings → GitLab first.`
      : "There is no GitHub token. Add one in Settings → GitHub first.",
  );
}

/**
 * The client for a host, once any remembered token has been loaded. `provider` is undefined while there is no
 * token for exactly this host (for GitLab: for this server).
 */
export function useGitProvider(
  target: GitHostTarget,
  fetchImpl?: typeof fetch,
): { ready: boolean; provider: GitProvider | undefined } {
  const key = targetKey(target);
  const hasToken = useSyncExternalStore(subscribeAny, () => hasTokenFor(target));
  const [readyKey, setReadyKey] = useState<string>();
  useEffect(() => {
    let current = true;
    void loadTokenFor(target).then(() => {
      if (current) setReadyKey(key);
    });
    return () => {
      current = false;
    };
    // `target` is covered by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const provider = useMemo(
    () => (hasToken ? createProviderFor(target, fetchImpl) : undefined),
    // `target` is covered by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasToken, key, fetchImpl],
  );
  return { ready: readyKey === key, provider };
}

/**
 * The host a dialog works with. GitHub is one host; GitLab has a token per server, so the dialog uses the
 * server picked in it, else the one last used in Settings, else any server that has a token.
 */
export function useHostTarget(provider: GitProviderId): {
  target: GitHostTarget;
  /** Servers that have a GitLab token. Empty for GitHub. */
  servers: string[];
  server: string;
  chooseServer(server: string): void;
} {
  const gitLab = useSyncExternalStore(subscribeGitLab, getGitLabState);
  const [chosen, setChosen] = useState<string>();
  const server =
    chosen && gitLab.servers.includes(chosen)
      ? chosen
      : gitLab.servers.includes(gitLab.server)
        ? gitLab.server
        : (gitLab.servers[0] ?? DEFAULT_GITLAB_SERVER);
  return {
    target: provider === "gitlab" ? gitLabTarget(server) : GITHUB_TARGET,
    servers: provider === "gitlab" ? gitLab.servers : [],
    server,
    chooseServer: setChosen,
  };
}

/**
 * Which host a pasted file link belongs to: a github.com link is GitHub, and an https link in GitLab's
 * `<server>/<namespace>/<project>/-/blob/<ref>/<path>` form is GitLab on that server. Anything else is
 * undefined, so the dialog's own host reports that it is not a file link.
 */
export function detectLinkTarget(input: string): GitHostTarget | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  if (host === "github.com" || host === "www.github.com" || host === "raw.githubusercontent.com") return GITHUB_TARGET;
  if (url.protocol !== "https:" || url.username || url.password) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const dash = parts.indexOf("-");
  if (dash >= 2 && (parts[dash + 1] === "blob" || parts[dash + 1] === "raw")) return gitLabTarget(url.origin);
  return undefined;
}

/** The text for an error in a dialog: the provider's own message, or a generic one that names the host. */
export const describeGitError = (error: unknown, hostName: string): string =>
  error instanceof GitProviderError ? error.message : `Something went wrong while talking to ${hostName}.`;

/**
 * Whether a GitLab token is set (for any server), so the GitLab menu items and commands are shown. Also loads
 * the tokens remembered on this device once, at startup.
 */
export function useGitLabEnabled(): boolean {
  const state = useSyncExternalStore(subscribeGitLab, getGitLabState);
  useEffect(() => {
    void loadRememberedGitLabTokens();
  }, []);
  return state.servers.length > 0;
}
