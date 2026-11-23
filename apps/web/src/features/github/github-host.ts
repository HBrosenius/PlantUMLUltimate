import type { GitProvider } from "../git/git-provider";
import { createGitHubClient } from "./github-client";
import { getGitHubState, getGitHubToken, loadRememberedGitHubToken, subscribeGitHub } from "./github-settings";

/**
 * The GitHub token store as the shared Git host code needs it. The token is read only inside features/github,
 * so a guard test can keep every other folder away from it.
 */
export const githubHasToken = (): boolean => getGitHubState().hasToken;
export const subscribeGitHubToken = subscribeGitHub;
export const loadGitHubToken = loadRememberedGitHubToken;

/** A client for GitHub, or undefined when no token is set. */
export function createGitHubProvider(fetchImpl?: typeof fetch): GitProvider | undefined {
  const token = getGitHubToken();
  return token ? createGitHubClient({ token, ...(fetchImpl ? { fetch: fetchImpl } : {}) }) : undefined;
}
