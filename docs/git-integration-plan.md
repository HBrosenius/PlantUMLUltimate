# B4: Git provider integration — plan

Status: decided 2026-11-23 (see [section 6](#6-decisions)). G0 + G1, G2 and G3 (upstream changes) are built, and Propose as new file is added. Source: [next steps, B4](next-steps-2026-11-20.md#b4-git-provider-integration--value-high-for-the-stated-primary-user-effort-l).

## 0. What this is for

The strategy names developers who keep PlantUML in Git as the main audience, but the app has no Git integration. Today they download a file, copy it into a checkout and commit it by hand.

The first version should close that loop for the common case:

1. Open a `.puml` file straight from a GitHub repository.
2. Edit it with everything the app already has (visual editing, AI edits, review).
3. Propose the change as a pull request, with the semantic review as the description.

## 1. What exists to build on

- **Semantic review and patch:** `semantic-review.ts` groups changes by meaning (`buildReviewGroups`), and `createUnifiedPatch` makes a unified diff. `createReviewReport` renders both as HTML; a PR description needs a Markdown version.
- **Three-way merge:** `threeWayMerge` (used by AI edits for stale documents) can rebase local edits when the file changed upstream.
- **Integration Worker:** `apps/integration-worker` already does Atlassian OAuth and API tokens. It keeps encrypted sessions in D1 behind an HTTP-only cookie, allows only listed origins (CORS), and rate-limits token connects.
- **Own-key pattern:** AI edits keep the user's API key in the browser: held in memory, optionally remembered, never in documents, backups or collaboration state (`ai-settings.ts`).
- **CSP:** the app's `connect-src` already allows `https:`, so the browser can call `api.github.com` directly. GitHub's REST API accepts browser requests (CORS) with an `Authorization` header.

## 2. Options for signing in

| Option                                             | How it works                                                                                                                                                                                           | Server                                            | Who it suits                                                   | Effort |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------- | ------ |
| **A. Fine-grained personal access token**          | The user creates a token on GitHub limited to chosen repositories (Contents and Pull requests: read and write) and pastes it into Settings → GitHub. The browser calls the API directly.               | None                                              | Individual developers; matches the own-key choice for AI edits | S      |
| **B. GitHub App, user sign-in through the Worker** | A "Sign in with GitHub" button. The Worker holds the app's client secret, exchanges the code and keeps the user token in an encrypted session, like Jira. The app is installed on chosen repositories. | Worker routes, a GitHub App registration, secrets | Teams and organisations; no token handling by users            | M–L    |
| **C. OAuth App**                                   | Like B, but with broad `repo` scope over every repository the user can reach.                                                                                                                          | Worker                                            | Nobody: wider access than needed                               | M      |

**Recommendation: A first, then B if teams ask.** A ships the whole loop without new infrastructure or a GitHub App to register, and the user decides exactly which repositories the app can touch. B can reuse everything above the sign-in layer: the client only needs a different way to get a token.

## 3. The first version (option A)

- **Settings → GitHub:** paste a token, "Test connection" (shows the GitHub user and the repositories the token reaches), remember it on this device or keep it for the session only, and forget it. The token is never written to documents, backups, snapshots or collaboration state, and never logged.
- **File → Open from GitHub…:** paste a file URL (`github.com/owner/repo/blob/branch/path.puml`) or pick a repository, a branch and a file from a tree filtered to PlantUML extensions (`.puml`, `.plantuml`, `.pu`, `.iuml`, `.wsd`). The tab remembers where it came from: repository, branch, path and the file's blob SHA.
- **The tab shows its origin:** a small "GitHub · owner/repo · branch · path" label with "Open on GitHub". Saving locally still works as today.
- **Propose change…** (for a tab opened from GitHub, with edits):
  - A dialog with the branch name (default `plantuml/<file>-<yyyymmdd>`), a commit message and a PR title, plus a preview of the description.
  - The description is the semantic review in Markdown: change groups with confidence, then the unified patch in a collapsed `<details>` block, and a line saying it was made with PlantUML Ultimate.
  - The app creates the branch from the base commit, commits the file through the Contents API (with the blob SHA, so GitHub refuses to overwrite a newer file), opens the PR, and shows its link.
  - Proposing again from the same tab while the PR is open adds a commit to the same branch, and the PR description is updated.
- **When the file changed upstream:** the commit is refused because the SHA no longer matches, and the empty branch is removed. The app fetches the latest version from that branch (the base branch, or the proposal branch when adding a commit) and runs `threeWayMerge` against the version it started from (the opened blob, or the content last proposed). A clean merge is shown in the Propose dialog before anything is committed, with what changed upstream and what the proposal adds on top; "Use merged version and propose" applies it to the tab as one undoable source change, makes the upstream blob the new base, and retries. A real conflict stops with the conflicting line ranges and a suggestion to open the file from GitHub again; there is no interactive conflict resolver.
- **Propose as new file on GitHub…** (File menu and command palette, for a tab that is not linked to GitHub): for a new diagram or a file from disk. The dialog takes a repository, a base branch, a file path inside the repository (folders allowed; it must end in a PlantUML extension), a new branch name, a commit message and a PR title. The app checks the path is free on the base branch, creates the branch, commits the file through the Contents API without a blob SHA, and opens the PR; if anything fails after the branch exists, the branch is removed again. The description is a short "New diagram file" note with the source in a collapsed block (a semantic review against an empty file would only say everything was added). Afterwards the tab is linked as if opened from the new file (ref is the base branch, SHA is the new blob, with the PR as its proposal), so Propose change adds commits to that PR and the label shows "PR #n". Once that PR is closed: if it was merged, proposing again works as usual against the base branch; if it was closed unmerged, the file is gone from the base branch, so the next proposal adds the file again (new branch, no SHA) instead of failing.
- **Without write access** (a public repository the user can't push to), the first version says so and offers to download the file. Forking is later.

## 4. Slices

| Slice                                  | Delivers                                                                                                                                                                                                                           | Notes                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **G0. GitHub client and settings**     | A small typed client (user, repositories, branches, tree, file, create ref, put contents, create and update PR) with error mapping (401, 403, 404, 409, 422, rate limits). Settings → GitHub with token test, remember and forget. | Fetch is injected, so unit tests never call GitHub. No real API in CI. |
| **G1. Open from GitHub**               | File URL paste and repository, branch and file picker. Opens a tab with its GitHub origin.                                                                                                                                         | Large trees: lazy folder loading, PlantUML files only.                 |
| **G2. Propose change**                 | Markdown review formatter, the dialog, branch, commit and PR. Link back to the PR, and updating an open PR.                                                                                                                        | The heart of B4. E2E with a mocked GitHub API.                         |
| **G3. Upstream changes**               | SHA mismatch handling with `threeWayMerge` and the review panel.                                                                                                                                                                   | Reuses the AI edits machinery.                                         |
| **G4. Sign in with GitHub (option B)** | GitHub App and Worker routes, reusing the Jira session pattern.                                                                                                                                                                    | Only if teams ask.                                                     |
| **G5. Beyond GitHub.com**              | GitHub Enterprise Server (custom API base), forks, then GitLab.                                                                                                                                                                    | Later, on demand.                                                      |

G0 → G1 → G2 is the minimum useful set. G3 can follow G2 quickly.

## 5. Out of scope

- A CLI or GitHub Action for checks: the renderer depends on the DOM, so that is a separate, larger job.
- Editing `.pumlu` documents in Git. Git users keep plain `.puml`.
- Several files in one PR. One file per PR first.
- Git hosting other than GitHub until G5.

## 6. Decisions

Decided on 2026-11-23:

1. **Sign-in starts with a fine-grained personal access token (option A).** The browser calls GitHub directly; "Sign in with GitHub" through the Worker (G4) waits until teams ask.
2. **The token is kept like AI keys:** in memory for the session, with an opt-in "remember on this device", and never in documents, backups, snapshots or collaboration state.
3. **The first PR is G0 + G1:** the GitHub client, Settings → GitHub, and Open from GitHub. Propose change (G2) follows in its own PR.
4. **The PR description is the semantic review plus the patch** in a collapsed block. No rendered images, since GitHub has no API for PR image attachments.
