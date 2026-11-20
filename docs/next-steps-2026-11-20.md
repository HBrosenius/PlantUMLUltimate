# What to do next — review of 2026-11-20

Baseline: `main` at `8ae2017`, one week after the v1.0.0 release. Status: proposal for review. Nothing here is implemented.

## How this was put together

- Read the README, changelog, [feature strategy](feature-strategy.md), the [3 Nov usability review](archive/ux-review-2026-11-03.md), the [Stage proposal](bold-ux-proposal-stage-mode.md), the [Mindmap plan](mindmap-plan.md) and the open GitHub issues and pull requests.
- Ran the dev build in Chromium at 1440×900 and 375×812. Walked through: new-diagram chooser → Gantt split view → Stage → command palette → mobile Task list.
- Ran the unit suite on Windows: **2,653 passed, 1 failed** (see E2).
- Checked some code-health signals: file sizes, TODOs and stale branches.

**Not done:** I didn't run the browser e2e suites, collaboration or Jira, and I didn't walk the canvases for diagram types other than Gantt. Rows marked _(3 Nov)_ come from the earlier review. I checked those I could in the running app; the rest are marked _not re-checked_.

## Summary

1. **Merge PR #113 first.** It is the cheapest way to make the app noticeably faster. It is finished, measured, and has been open for two weeks while 23 commits landed on `main`, so it will only get harder to merge.
2. **Then do about a day of polish** (E1–E9). Most of these are leftovers from the 3 Nov review that are still visible, plus two small bugs I found.
3. **For the next feature, pick between two directions:**
   - **AI-assisted edits through the existing review pipeline** (B1): the biggest increase in value.
   - **Mindmap support** (B2): the cheapest new capability.

   The app already has what most AI diagram tools lack: source-preserving edits, validation, semantic diffs and grouped accept/reject. That is what makes B1 worth considering.

## Easy wins (hours each)

> **Status, 2026-11-20:** E1 and E2 are done (#113 and #133). The polish PR covers E3, E6, E7, E8 and the weekend-date part of E5, and rechecks E9. E4 was left out because the 150% cap on automatic fitting is deliberate (`initial-diagram-zoom.ts:4`, "not into a few giant cells"). Changing it is a design choice, not a fix. The rest of E5, a starter with dependencies, people and a milestone, was also left out: about a dozen e2e specs use the default chart as their fixture. That content belongs in the chooser's Examples tab instead.

| #   | What                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                              | Fix                                                                                                                                             |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **Merge or rebase PR #113** (performance roadmap items 1–13)                | Open since 7 Nov and marked mergeable. Its own measurements: keystroke → preview drops from 174 to 99 ms, switching back to a rendered tab from ~180 to ~45 ms, the render #21 spike is gone, and the editor appears in 114 ms even when the document request hangs.                                                                                                                                  | Rebase onto `main` and run the 3-browser e2e for touched specs plus `test:e2e:pwa` (it changes the service worker). Then merge.                 |
| E2  | **Unit test fails on Windows checkouts**                                    | `source-format.test.ts:347` fails with "Standalone CR line endings are not supported". With `core.autocrlf=true` and no `.gitattributes`, the fixture `tests/fixtures/gantt-formatter-complete.puml` is checked out with CRLF. The test then splits on `\n`, which leaves stray `\r` characters.                                                                                                      | Add a `.gitattributes` with `* text=auto eol=lf` (and binary rules for PNG etc.). That also protects every other fixture and `.puml` example.   |
| E3  | **Mac shortcut glyphs shown on Windows/Linux**                              | The command palette shows `⌘W`, `⌘N`, `⌘O`, `⌘S`, `⌘Z` and `⌘1–4` on Windows (`app/use-app-commands.ts:313`, `:371–373`, `:427`, `:436`). Stage's "Ask or do…" shows `⌘K` (`stage/StageTopBar.tsx:75`). `platform-shortcuts.ts` and `HelpDialog.tsx:124` already format labels correctly per platform.                                                                                                | Route these labels through the existing platform helper.                                                                                        |
| E4  | **Diagram doesn't fit the pane when it opens** _(3 Nov 3.1, still present)_ | The new Gantt opens at 150% as a small card in the top-left of split view, and as a small card in the middle of Stage. Most of the canvas is empty.                                                                                                                                                                                                                                                   | Default to Fit on open and on pane resize until the user zooms manually.                                                                        |
| E5  | **The Gantt starter doesn't show what the app is good at**                  | `createDefaultGanttSource` (`model.ts:20`) creates four tasks with fixed dates: no dependencies, no people, no milestone. A new user's first chart shows none of the drag-to-link, workload, critical path or forecast features. Also, `dateAt(5)` lands on a Saturday when today is Monday, and `dateAt(-7)` lands on a weekend when today is a weekend. So a sample task can start on a closed day. | Use `starts at [X]'s end` chains, one `on {Alice}` assignment and a milestone. Snap the start dates to working days.                            |
| E6  | **Error navigation buttons show when there are no errors** _(3 Nov 3.6)_    | The editor toolbar shows `↑ ↓ ?` while the status bar says "No issues".                                                                                                                                                                                                                                                                                                                               | Show them only when there are diagnostics, with a count ("2 issues ↑ ↓").                                                                       |
| E7  | **Command palette lists unavailable commands first** _(3 Nov 2.6)_          | With one tab open, the greyed-out "Previous tab" and "Next tab" sit near the top of the default list.                                                                                                                                                                                                                                                                                                 | Sort disabled commands last, or hide them until the user types a query.                                                                         |
| E8  | **One name for the task list** _(3 Nov 3.5)_                                | On mobile the tab is "Task list", but its heading is "Task check-in", which is also the name of a report.                                                                                                                                                                                                                                                                                             | Use "Task list" everywhere and keep "Task check-in" only for the report.                                                                        |
| E9  | **Flaky Firefox e2e** (issue #124)                                          | `jira.spec.ts` "retains uncertain publish results across panel closes". This is the only open issue. Commit `9ebec12` hardened it, but the issue is still open.                                                                                                                                                                                                                                       | Reproduce with `--repeat-each=20` on Firefox. Close the issue if it's fixed, otherwise apply the same readiness-wait pattern used in `9ebec12`. |
| E10 | Smaller polish _(3 Nov, still visible)_                                     | The Create / Open / Examples tabs in the chooser still look like plain buttons (1.2). The preview hint paragraph is still on screen, though now dismissible (3.3). "Selected" and "Today" still read as status words (3.4). The Timeline slider has no labels (3.8).                                                                                                                                  | Batch these into one "3 Nov leftovers" PR.                                                                                                      |

### Housekeeping (minutes)

- **Remote branches:** about 30 remote branches aren't merged into `main` by ancestry. Most are likely squash-merged already, for example `feat/stage-mode`, `release/v1.0.0`, `fix/gantt-multiple-predecessors` and `fix/audit-2026-10-26`. Delete the merged ones so the list shows real work in progress. `codex/plantuml-film`, `fix-wbs-theme-node-colours` and `fix/wbs-keyboard-focus` are from September and are worth checking for anything that never landed.
- **Scratch logs in the repo root:** 66 `*.local` log files are there. They're git-ignored, but they clutter the folder. Have scripts write them under a single ignored directory instead.
- **`.claude/launch.json`:** it contains macOS-only paths (`/private/tmp/...` and `/Users/henbro/...`). Keep only the portable `web` entries, or move personal ones to a local file.

## Medium (days each)

| #   | What                                                              | Why                                                                                                                                                                                                                                | Notes                                                                                                                                                                  |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **One commit model for inspectors** _(3 Nov 5.1, not re-checked)_ | Calendar & schedule used Apply/Cancel while the Task inspector auto-saves. Users can't tell whether an edit took effect.                                                                                                           | Auto-apply everywhere. Undo already covers mistakes.                                                                                                                   |
| M2  | **One home for diagram settings** _(3 Nov 4.1, not re-checked)_   | Settings are spread over five places: Diagram options, View → Diagram settings, Plan → Calendar & schedule, File → Document settings and ⚙ → Gantt preferences.                                                                    | Put "how it looks" in Diagram options and "how the plan works" in Calendar & schedule. Make the others shortcuts into those two.                                       |
| M3  | **Decide Stage's future**                                         | Stage is opt-in. Its proposal argued that the canvas is where the product's strengths are. Running both layouts doubles the UI surface that has to be kept consistent: two toolbars, two zoom controls and two "Ask" entry points. | This is a product decision, not a bug. Options: make Stage the default for diagram-first types (WBS, Use Case, Component), or keep it opt-in and stop investing in it. |
| M4  | **Keep shrinking the largest components**                         | `App.tsx` is down to 3,440 lines after #115. `DiagramPreview.tsx` (2,570), `CodeEditor.tsx`, `SequenceDiagramPreview.tsx` and `ClassEditors.tsx` (~1,400 each) are the next hotspots.                                              | Do this only alongside a feature that touches them. It isn't worth a standalone refactor.                                                                              |
| M5  | **Get real users in front of it**                                 | Every strategy document since September says to validate with 3–5 users before building more. There's no record that this has happened. v1.0.0 is a natural moment.                                                                | Give 3–5 people tasks such as "create a plan, link dependencies, share it". Choose B1–B5 based on where they struggle, rather than on this list alone.                 |

## Bigger features

Ranked by value relative to effort, given what the code already has. Effort assumes one developer: **M ≈ 1–3 weeks, L ≈ 3–6 weeks**.

### B1. AI-assisted edits through the review pipeline — value: high, effort: L

**What:** select something, ask for a change ("add a timeout path to this call", "split Backend into API and DB tasks"), and get a PlantUML patch. That patch is shown in the existing semantic review, where you accept it group by group.

**Why now:** Mermaid Chart and Eraser have made AI editing an expected feature (see the [feature strategy](feature-strategy.md)). This app already has the hard parts most competitors lack:

- source-preserving transformations (ADR 0003)
- diagnostics and quick fixes
- local rendering for validating proposals
- semantic diff with grouped accept/reject
- unified undo

The AI only needs to produce source. Everything after that is already built and tested. Stage's "Ask or do…" box is the natural entry point.

**Constraints:**

- **Privacy:** the app is local-first, so this must be explicit opt-in, and it must show exactly what text leaves the device.
- **Keys:** offer a bring-your-own API key, or proxy through the existing integration Worker so no key sits in the browser.
- **Scope:** start with Sequence and Gantt, where semantic review is strongest.
- **Validation:** never apply a patch that doesn't parse and render.

**First slice:** a selection-scoped command on Sequence. Proposal → parse/render check → semantic review → accept. No auto-apply and no whole-document regeneration.

### B2. Mindmap as the eighth diagram type — value: medium, effort: M

[`mindmap-plan.md`](mindmap-plan.md) already lays out the work:

- Detection exists (`language-plantuml` recognises `@startmindmap`).
- The syntax is nearly the same as WBS, which already has full visual editing.

This is a low-risk way to cover a very common PlantUML diagram. It also suits Stage, whose canvas-first layout fits mind maps well.

### B3. Shareable read-only snapshots and walkthroughs — value: medium–high, effort: M

Today the only way to show a diagram to someone who doesn't edit is a live collaboration viewer link, which needs a running room. You could add either or both:

- **Publish snapshot:** a static, version-pinned, read-only view of a document, or an offline single-file HTML export with the rendered SVGs, clickable links between diagrams, and the Gantt hover details.
- **Walkthrough:** step through a Sequence diagram with captions (feature set 6 in the strategy).

This makes the app useful to stakeholders who will never open the editor, and it brings new users to it.

### B4. Git provider integration — value: high for the stated primary user, effort: L

The strategy names "developers maintaining PlantUML in Git" as the primary audience, but the code has no Git integration. Today those users must download a file and commit it by hand. A first slice:

- open a `.puml` from a GitHub repository, using a token or the GitHub App flow through the integration Worker
- edit it
- open a PR with the patch, plus the semantic-review report as the PR description

This builds on semantic review and patch export, which already exist. A CLI or GitHub Action for checks (feature set 5) is a bigger job because the renderer depends on the DOM. Do this first.

### B5. State diagram support — value: medium, effort: M–L

After Mindmap, State diagrams are the most common PlantUML type that isn't supported. Visual editing would reuse the node/edge patterns from Activity and Use Case. Wait for user signals (M5) before choosing this over B1–B4.

### Not recommended now

- **More planning integrations** (Linear, Azure DevOps): Jira was just finished. Wait for demand.
- **Accounts or cloud workspace storage:** this works against the local-first, account-free positioning, and nothing suggests it's needed.
- **Generating whole diagrams with AI and no review step:** competitors already do this. This app's edge is precise, reviewable edits (B1).

## Suggested order

1. **This week:** E1 (merge #113) and E2 (`.gitattributes`), then E3–E9 as one or two small PRs, plus the housekeeping.
2. **Next:** M5 (user sessions), run alongside M1 and M2.
3. **Then:** choose **B1** if the goal is standing out, or **B2** if the goal is coverage at low risk. B3 suits either path and is a good second feature.
