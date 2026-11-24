# B6: Diagram review in pull requests — plan

Status: proposal, 2026-11-24. Nothing is implemented. Builds on [feature strategy, set 5](feature-strategy.md#5-repository-checks-and-drift-detection), [semantic review](semantic-review.md), [snapshots](snapshots-plan.md) and the [GitHub](git-integration-plan.md) and [GitLab](gitlab-integration-plan.md) integrations.

## 0. Why this, and why now

The [20 Nov review](next-steps-2026-11-20.md) listed five big features. Four are now built:

| Item | Feature                              | Status                                             |
| ---- | ------------------------------------ | -------------------------------------------------- |
| B1   | AI-assisted edits through the review | Built (A0–A6): Sequence and Gantt, three providers |
| B2   | Mindmap                              | Built (S1–S5)                                      |
| B3   | Snapshots                            | Built (S1–S4)                                      |
| B4   | GitHub, then GitLab                  | Built; GitLab L0 (real-server check) still open    |
| B5   | State diagrams                       | Not started                                        |

The app's best work now happens **inside** the app. The primary user from the strategy, "developers and technical leads maintaining PlantUML in Git", spends most of their review time **outside** it: in a pull request or merge request. A reviewer today sees this:

```diff
-Alice -> Backend: login(user, pass)
+Alice -> Gateway: login(user, pass)
+Gateway -> Backend: login(user, pass)
```

They have to picture the diagram in their head, and most don't. The app already knows how to say "Gateway was added between Alice and Backend; one message moved, one added", how to render both versions, and how to make a version-pinned HTML snapshot. None of that reaches the place where the change is actually reviewed.

**B6 brings it there.** Every pull request or merge request that touches a `.puml` file gets a comment:

- the rendered diagram **before and after**, side by side;
- the **semantic review**: what was added, removed, moved or renamed, grouped the same way as in the app;
- **checks**: syntax errors, broken links between diagrams, and the team's own rules;
- a link that **opens the changed file in the app** on the PR's branch, ready for Propose change.

This also turns every reviewer into someone who has seen the app, without anyone having to install anything. That is the "next level": from a tool one person opens, to something the whole team meets in its daily review.

What it is **not**: it does not infer diagrams from code, and it does not claim a diagram matches the code. Drift detection from code (feature set 5, later parts) can build on this, but is not in this plan.

## 1. What exists to build on

- **Semantic review** (`apps/web/src/semantic-review.ts`, `buildReviewGroups`): Sequence and Gantt in depth, a line diff for the other types. Used by version history, AI edits and the propose flows. `createReviewMarkdown` already turns it into the PR description text.
- **Parsers** in `packages/diagram-*` and `packages/language-plantuml`: diagram detection, diagnostics and the structures the review compares.
- **Project links** (`packages/project-model`): links between diagrams, which can be checked for targets that no longer exist.
- **Rendering** with the official `@plantuml/core` browser build in a sandboxed worker ([rendering.md](rendering.md)). It needs a browser: DOM, OffscreenCanvas or a font atlas.
- **Snapshots**: a self-contained, read-only HTML file with every diagram rendered, Gantt details on hover and optional source.
- **The GitHub and GitLab clients**, and `safeGitHubUrl` / `isSafeOriginLink` for links.
- **Playwright** is already a dev dependency and runs Chromium, Firefox and WebKit in CI.

## 2. Shape of the change

Three pieces, each useful on its own:

### 2.1 A review core that runs outside the browser

Move what the review needs out of `apps/web` into a new package, `packages/review-core`:

- `buildReviewGroups` and its helpers, and the text output (`createReviewMarkdown` and a structured JSON form);
- the checks (section 3).

It must run in Node with no DOM. Parsers that use `document` or `window` (for example parts of `diagram-sequence`) get their parsing split from their preview code. The web app imports the package instead of its own copy, so the app and CI always agree on what a change means.

### 2.2 A command line tool: `plantuml-ultimate`

Published to npm as `@plantuml-ultimate/cli` (name to confirm), run with `npx`:

```text
plantuml-ultimate check  [files…]                     # syntax, links, rules; exit 1 on errors
plantuml-ultimate review --base <ref> [--head <ref>]  # semantic review of changed .puml files
plantuml-ultimate render [files…] --out <dir>         # SVG/PNG of each diagram
plantuml-ultimate report --base <ref> --out review.html  # one offline HTML: before/after, review, checks
```

- `check` and `review` need only Node and git.
- `render` and `report` need a renderer (section 4).
- Output as text for people, `--json` for tools, and Markdown for comments.

### 2.3 CI integrations

- **GitHub Action** (`plantuml-ultimate/review-action`): on `pull_request`, runs the CLI on the changed files, posts or updates **one** comment, sets a check status, and uploads the HTML report as an artifact.
- **GitLab CI template** (`.gitlab-ci.yml` include): the same, as a merge request note and a job artifact.
- Both run inside the user's own CI with the CI's own token. Nothing goes through our servers.

## 3. Checks

Start with checks that give the same answer every time and are clearly right:

| Check                     | Example finding                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Syntax                    | `docs/login.puml:14` — PlantUML can't parse this line                                                            |
| Renders                   | `docs/plan.puml` parses but PlantUML fails to render it                                                          |
| Broken diagram links      | `overview.puml` links to `services/billing.puml`, which this PR deletes                                          |
| Unsupported in the editor | `class.puml` uses syntax the visual editor can't change (shown as a note, not an error)                          |
| Team rules (opt-in)       | `.plantuml-ultimate.json`: required title, allowed participants, forbidden arrows between named groups, max size |

Rules are a small, versioned JSON schema, not a scripting language. Each finding has a file, a line, a severity (error, warning, note) and a message. Only errors fail the job.

## 4. Rendering outside the app

This is the one real technical risk. Two options, decided by a spike (R0):

| Option                       | How                                                                                                        | For                                                          | Against                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **A. Headless Chromium**     | The CLI starts Playwright's Chromium and runs the same `@plantuml/core` build and font handling as the app | Same output as the app, pixel for pixel. Reuses tested code. | ~150 MB browser download in CI (cacheable). Slower start (~2 s).            |
| **B. Official PlantUML JAR** | Run `plantuml.jar` with Java                                                                               | The reference renderer. Common in CI already.                | Needs Java and Graphviz. Output can differ from the app's (fonts, version). |

**Recommendation: A**, with B as a fallback flag (`--renderer jar`). The point of B6 is that the comment shows what the app shows. `check` and `review` never need a renderer, so a team can start without one.

## 5. The comment

One comment per PR, updated in place on each push (found by a hidden marker), never a new one per push:

```markdown
### PlantUML Ultimate review — 2 diagrams changed

**docs/login.puml** (Sequence) · ✅ no problems

| Before           | After           |
| ---------------- | --------------- |
| ![](…before.svg) | ![](…after.svg) |

- **Added participant** Gateway
- **Moved message** `login(user, pass)`: Alice → Backend is now Alice → Gateway
- **Added message** Gateway → Backend: `login(user, pass)`

[Open in PlantUML Ultimate](https://plantuml.brosenius.se/#open=…) · [Full report](…artifact)

**docs/plan.puml** (Gantt) · ⚠️ 1 warning
…
```

- **Images:** GitHub and GitLab comments can't embed artifact files directly. Options: commit nothing and link the HTML report only; upload images to a branch the action owns (`plantuml-ultimate-images`); or GitHub's job summary. Decided in R2 (section 7, question 3).
- **Open in the app:** a link with the provider, server, project, branch and path only. No source, no token. The app opens it through the existing Open from GitHub/GitLab flow, so the user's own token is used and nothing new is trusted.
- Text from diagrams is escaped with the existing `escapeMarkdown` and fenced code.

## 6. Security and privacy

- **No servers of ours.** The CLI runs on the user's machine or in their CI. It makes no network calls except git and, in the action, the provider's API with the CI token.
- **Tokens:** the action uses `GITHUB_TOKEN` (with `pull-requests: write` only) or GitLab's `CI_JOB_TOKEN` / a project token from CI variables. They are never written to files, reports or logs.
- **Pull requests from forks** get no write token on GitHub. The action then writes the report as a job summary and an artifact, and posts nothing. It must not use `pull_request_target` with the fork's code.
- **Untrusted diagrams:** the renderer runs with network blocked, as in the app. A `.puml` file in a PR is untrusted input: no `!include` from URLs, a time limit per diagram and a size limit per file.
- **Reports** contain only what the repository already contains. Source is included only when asked, like snapshots.

## 7. Open questions

1. **Name and package.** `@plantuml-ultimate/cli` and `plantuml-ultimate/review-action`, or something under your own GitHub account?
2. **Renderer:** headless Chromium as the default (recommended), or the JAR?
3. **Images in the comment:** link to the HTML report only (simplest, nothing written to the repository), or keep rendered images on a branch the action owns (pictures inline, but it writes to the repository)?
4. **Which provider first:** GitHub (recommended: the Action is the bigger audience and the app's GitHub flow has been checked on a real repository), or both at once?
5. **Licence and release:** the CLI and Action are public npm/Marketplace releases, so they need a licence and a release process. Is the repository's current licence right for that?

## 8. Slices

Effort for one developer: **S ≈ days, M ≈ 1–3 weeks**.

| Slice                          | Delivers                                                                                                    | Effort | Gate                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| **R0. Spikes**                 | Can the parsers run in Node? Can headless Chromium render with the app's renderer in < 5 s for 10 diagrams? | S      | Both yes, or a clear fallback.                                                            |
| **R1. Review core**            | `packages/review-core`, used by the web app. No visible change in the app.                                  | M      | All existing review, AI edits and propose tests pass unchanged.                           |
| **R2. CLI: check and review**  | `check` and `review` with text, JSON and Markdown output. Fixture repository with known changes.            | M      | Known fixture changes give the expected findings; unchanged input gives identical output. |
| **R3. CLI: render and report** | Headless rendering and the offline HTML report (reusing the snapshot layout).                               | M      | Same SVG as the app for the fixture set; report opens offline.                            |
| **R4. GitHub Action**          | One updated comment, a check status, the report as an artifact, fork-safe.                                  | M      | Runs on a test repository; a fork PR posts nothing and leaks nothing.                     |
| **R5. GitLab CI template**     | The same for merge requests.                                                                                | S      | Runs on a GitLab test project (after GitLab L0).                                          |
| **R6. Team rules**             | `.plantuml-ultimate.json` with the first rule set and documentation.                                        | S–M    | A pilot team writes one rule that catches a real mistake.                                 |
| **R7. Open in the app**        | The "Open in PlantUML Ultimate" link and its handling in the app.                                           | S      | Opens the right file on the PR's branch with the user's own token.                        |

R1–R3 are useful without any CI: a developer can run `npx plantuml-ultimate review --base main` locally. R4 is the moment it reaches the whole team.

**Suggested order:** R0 → R1 → R2 → R4 (with a text-only comment) → R3 → R7 → R5 → R6. That puts a working comment on real pull requests after R4, before the rendering work, so its value can be checked early.

## 9. How to know it works

- On the fixture repository, every known change produces its expected review lines, and a second run produces identical output.
- On your own repositories, the comment appears within a minute of a push, and reviewers read it instead of the raw diff (ask them).
- No false errors on the existing example diagrams in `docs/` and `tests/fixtures/`.
- At least one teammate who doesn't use the app follows "Open in PlantUML Ultimate" from a comment.

## 10. Out of scope

- Generating or updating diagrams from code (Eraser's ground; later, and only for explicitly machine-owned regions).
- Asserting that diagrams match the code (drift detection from code, OpenAPI or schemas).
- A hosted bot or GitHub App run by us.
- Bitbucket, Azure DevOps.
- Inline review comments on individual diagram elements.

## Alternatives considered

- **B5 State diagrams:** more coverage, but an eighth type adds breadth, not a new level. Better after B6, driven by what teams' repositories actually contain (B6's `check` will show which unsupported types they use).
- **Walkthroughs (feature set 6):** valuable for people who don't edit, but B6 reaches the same people in a place they already visit every day.
- **Making Stage the default:** a product decision worth taking, but it changes how the app feels, not who it reaches.
- **User sessions (M5):** still the best way to choose between all of these. B6's R0–R2 are cheap enough to run alongside them.
