# B4 G5: GitLab support — plan

Status: decided 2026-11-23 (see [section 7](#7-decisions)); L0 is next. Builds on [B4: Git provider integration](git-integration-plan.md), where G0–G3 and Propose as new file are built for GitHub.

## 0. What this is for

Many teams keep their diagrams in GitLab, often on their own GitLab server. The GitHub loop is built and works: open a file, edit it, propose the change, merge it in the provider. GitLab users should get the same loop:

1. Open a `.puml` file from a GitLab project (gitlab.com or a self-managed instance).
2. Edit it with everything the app already has.
3. Propose the change as a merge request with the semantic review as its description, or add a diagram as a new file.

## 1. What exists to build on

- **Everything in `apps/web/src/features/github/`:**
  - the typed client with injected fetch and error mapping (`github-client.ts`);
  - the tab's origin (`github-origin.ts`, stored as `githubOrigin` on `DocumentSnapshot` and validated by `normalizeGitHubOrigin`);
  - propose, upstream merge and new file flows (`github-propose.ts`, `github-upstream.ts`, `github-new-file.ts`);
  - token settings (`github-settings.ts`, the shared `credential-store.ts`);
  - the dialogs, the repository picker, the origin label and the next-step panel.
- **The review description and patch** (`createReviewMarkdown`) and `threeWayMerge` don't depend on the provider.
- **Tests:** unit tests with a fake API behind injected fetch, and e2e specs that mock the API with `page.route`. Nothing calls a real provider.
- **CSP:** `connect-src` already allows `https:`, so the browser can reach gitlab.com and self-managed servers directly.

Very little of the flow logic is specific to GitHub. What is specific: the client, URL parsing, the overwrite guard, wording, and the settings.

## 2. How GitLab differs

| Topic                 | GitHub (today)                                     | GitLab                                                                                                                |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Sign-in               | Fine-grained personal access token                 | Personal access token with the `api` scope (or a project access token). Bearer header.                                |
| Server                | Always `api.github.com`                            | `gitlab.com` or a self-managed URL. The API is at `<server>/api/v4`.                                                  |
| Repository            | `owner/repo`                                       | Project in nested groups, `group/subgroup/project`. The API takes the URL-encoded path or the numeric ID.             |
| File link             | `github.com/o/r/blob/<ref>/<path>`                 | `<server>/<group…>/<project>/-/blob/<ref>/<path>` (the `/-/` separates the project from the rest).                    |
| Read a file           | Contents API, base64, blob SHA                     | `repository/files/:path?ref=`, base64, with `blob_id` and `last_commit_id`.                                           |
| Overwrite guard       | The commit carries the blob SHA; 409 if it changed | The commit carries `last_commit_id`; GitLab refuses if the file changed since then (an error response, to be mapped). |
| Read an older version | `git/blobs/:sha`                                   | `repository/blobs/:sha/raw`, or the file at a commit ref.                                                             |
| Create a branch       | `POST git/refs`                                    | `POST repository/branches?branch=&ref=`                                                                               |
| Commit                | `PUT contents/:path`                               | `POST/PUT repository/files/:path`, or the Commits API with actions (create/update).                                   |
| Review request        | Pull request `#12`: open, closed (merged flag)     | Merge request `!12` (`iid`): opened, closed, merged, locked.                                                          |
| Empty repository      | `409 Git Repository is empty`                      | No default branch yet; committing a file with `branch=<default>` creates it (to verify).                              |

Two of these need real design work, not just mapping: **the overwrite guard** (section 4) and **self-managed servers** (section 5).

## 3. Shape of the change

### 3.1 Provider interface

A `GitProvider` interface in a new `features/git/` folder, with what the flows already call:

- `getUser`, `listRepositories`, `listBranches`, `listFolder`, `getFile`, `getVersionText`
- `getBranchHead`, `createBranch`, `deleteBranch`, `putFile`
- `createReview`, `getReview`, `updateReview` (pull or merge request)
- `parseFileUrl`, `fileUrl`

The GitHub client implements it unchanged; a GitLab client implements it too. The flows (`proposeChange`, `mergeUpstream`, `proposeNewFile`, `addFirstFile`) take a `GitProvider` instead of a `GitHubClient`.

### 3.2 Origin

- The tab's origin gets `provider: "github" | "gitlab"` and `server` (the web origin, e.g. `https://gitlab.example.com`).
- The guard field becomes provider-neutral: `version` (GitHub: blob SHA; GitLab: last commit ID), plus `blob` when the provider has one, for reading the opened version back.
- Stored data stays compatible: the field stays `githubOrigin` on `DocumentSnapshot` (renaming it would need a storage migration for nothing), and a record without `provider` reads as GitHub.
- Links in the label are shown only for `https` URLs on the origin's own server.

### 3.3 Settings

Settings gets a **GitLab** tab next to GitHub, with the server address (default `https://gitlab.com`), the token, Remember on this device, Test connection and Forget token. Tokens are kept per server, with the same rules as today: in memory unless remembered, and never in documents, backups, snapshots or collaboration state.

### 3.4 UI

- File → Open → **From GitLab…** and File → **Propose as new file on GitLab…**, or one item per action with a provider choice in the dialog (section 7, decision 3).
- The dialogs and the next-step panel say "merge request" and "MR !12" for GitLab.
- The label reads `GitLab · group/project · main · docs/plan.puml`, with an **MR !12** badge and **Propose change…**.

## 4. The overwrite guard

GitHub refuses a commit whose blob SHA no longer matches. GitLab checks `last_commit_id` instead: the ID of the last commit that touched the file when it was read.

- On open, store `last_commit_id` as the guard and `blob_id` to read the opened version back.
- On propose, send `last_commit_id`. If GitLab refuses because the file changed, map it to the same `UpstreamChangedError`, so G3's merge flow runs unchanged.
- After a commit, the new guard is the commit's ID. GitLab returns it for the file API, or it comes from the Commits API response.
- Unit tests pin the exact GitLab error response for a stale `last_commit_id`, so the mapping doesn't depend on wording alone.

## 5. Self-managed GitLab

- **Server address:** an `https` URL only. It is normalised to its origin, and requests go to `<origin>/api/v4`. No credentials or cookies are sent (`credentials: "omit"`), like GitHub.
- **CORS:** gitlab.com answers API requests from other sites. Self-managed servers do too by default, but an administrator can change that. If the browser blocks the request, the message says so and names the server, instead of a generic network error.
- **Tokens per server:** a token is stored with its server, and only sent to that server.
- **Links from stored origins** are shown only when they point to the origin's server over `https`.

GitHub Enterprise Server could reuse this later (a server address plus `/api/v3`), but it isn't part of this plan.

## 6. Slices

| Slice                      | Delivers                                                                                                                                                                                                                                                           | Notes                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **L0. Check the platform** | A short note: CORS on gitlab.com and on a default self-managed install, the stale `last_commit_id` error response, and creating the first file in an empty project.                                                                                                | Done by hand with a test project and a throwaway token, before code. No tokens in the repository.             |
| **L1. Provider refactor**  | `GitProvider` interface. The GitHub client behind it. The flows take a provider. Origin gets `provider`, `server`, `version`, `blob`, and old records still read. No visible change.                                                                               | All existing GitHub tests must pass unchanged.                                                                |
| **L2. GitLab client**      | Client for user, projects (membership, write access), branches, tree, files, blobs, branch create and delete, commit, merge requests. Link parsing with nested groups and `/-/`. Error mapping (401, 403, 404, the stale-guard error, rate limits, empty project). | Injected fetch and a fake GitLab in unit tests. Can be built in parallel with L1 once the interface is fixed. |
| **L3. GitLab in the app**  | Settings → GitLab, Open from GitLab, Propose change and Propose as new file for GitLab, label and MR badge, next-step panel wording.                                                                                                                               | E2E with a mocked GitLab on all three browsers.                                                               |

L1 and L2 can be built by two agents in parallel once the interface in 3.1 is agreed; L3 follows them.

## 7. Decisions

Decided on 2026-11-23:

1. **Self-managed GitLab from the start,** not gitlab.com only. Settings takes a server address (default `https://gitlab.com`), tokens are kept per server, and a blocked request (CORS) gets a clear message naming the server.
2. **Tokens:** a personal access token with the `api` scope, or a project access token. Settings explains that a project access token is the narrower choice.
3. **Menu items per provider:** "From GitLab…" and "Propose as new file on GitLab…" are separate items, shown once a GitLab token is set. Settings → GitLab is always there as the way in. The GitHub items stay as they are.
4. **A pasted link picks its provider:** pasting a GitLab link in the Open dialog opens it from GitLab, and a GitHub link from GitHub.
5. **No Sign in with GitLab (OAuth) for now,** like G4 for GitHub. It waits until teams ask.

## 8. Out of scope

- GitHub Enterprise Server, Bitbucket, Azure DevOps.
- Forks: proposing from a fork when the user can't push to the project.
- CI checks or a GitLab CI job (the renderer depends on the DOM).
- Several files in one merge request.
