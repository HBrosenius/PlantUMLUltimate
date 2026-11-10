# App reassessment: next improvements

Date: 2026-09-13. Inspected checkout: `3db8d48`. Scope: repository and targeted tests, not a deployed-app usability session or exhaustive audit.

> **Status update — 2026-09-28 (`7d7b2ae` plus local fixes):** The priorities below describe the September 13 baseline, not a current backlog. Later commits implemented live project snapshots and metadata preservation (`023e9e3`, `963193b`), lifecycle save coverage (`065b069`, `3044bf6`, `45c675e`), all-family project support and dialogs (`6df9a72`, `942ea17`), live link diagnostics and repair (`8fb03bf`, `e4ad9b2`, `cd6221b`), mixed-project benchmarks and save cancellation (`63ddb68`, `174e1cf`), and project-wide change review and export (`10fe16e` through `26d87cf`). These commits are in the current checkout. `npm run validate`, the final full browser matrix (489 passed, 24 skipped across three browsers), six PWA tests, one live-collaboration browser test, and the affected WBS/project sweep (89 passed, one skipped) passed on September 28. The local fixes have not been deployed, so deployed WBS behavior and usability outcomes remain unverified. Reproduce a specific problem on current code before reopening an item below.

## Historical recommendation (2026-09-13)

Make the next release about **trustworthy, effortless multi-diagram projects**. The product now has the right foundations: single-file projects, portable history, connected diagrams, and extracted diagram features. The highest payoff is connecting these foundations consistently before adding another major capability.

After that release, build **project-wide change review**: show what changed across diagrams and which linked items deserve attention. This extends existing semantic review and impact analysis into a cohesive feature with everyday engineering value.

## What has changed since the earlier plans

- Single-file projects are implemented and documented. Do not restart folder/ZIP or native-format design.
- WBS, Use Case, Activity, Sequence, Class and Gantt have feature extraction commits. Further refactoring should follow concrete change difficulty, not repeat completed tasks.
- Browser tests are split by diagram family. Component-test dependencies and performance baselines now exist.
- CI recently received workflow consolidation and source-trust changes. Inspect actual failures before proposing another broad CI rewrite.

## Priority 1 — Make the project snapshot complete and current

**Why first:** Save, recovery, history and links must describe the same current project. Several inspected paths suggest that this contract needs dedicated integration coverage.

### Findings and reproduction tasks

| Source observation                                                                                                                                                              | Risk to verify                                                                                                                                 | Required outcome                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `snapshotEmbeddedProject` in `apps/web/src/projects/embedded-project.ts:58–80` copies changed source/hash from open tabs but explicitly leaves graph/history metadata unchanged | Newly created history events, baseline selections or resource settings may be missing from project saves unless another path synchronizes them | Capture all persistent member state, including history and settings, from their authoritative owners                         |
| `useEmbeddedProject` observes tab source changes by updating refs; it does not update the project snapshot in that effect                                                       | Indexing/recovery driven by project state may lag behind live edits                                                                            | Index and recover the effective current project, without reintroducing the previous render/index feedback loop               |
| `useSingleFileProject` passes `() => snapshot.revision` to the save coordinator                                                                                                 | The coordinator's concurrent-edit check compares the captured revision to itself                                                               | Supply a live revision getter and test typing, history edits, and link edits during save; report a saved snapshot accurately |
| `openEmbeddedMember` trusts a cached tab ID without checking whether that tab still exists                                                                                      | Closing a diagram tab and reopening it may activate a stale ID                                                                                 | Reopen creates a valid tab while retaining member identity and the latest source/history                                     |

These are source-grounded risks, not claims of reproduced end-to-end data loss. Confirm each through hook/browser tests before choosing a fix.

### Implementation slices

1. Add a project lifecycle integration test harness that uses real hooks and persistence adapters, with controlled file writes.
2. Reproduce save → close → reopen with a new checkpoint, pinned version, baseline and resource change. Repair the snapshot boundary where necessary.
3. Reproduce source edit → backlink/index refresh and source edit → browser recovery. Establish one effective-project snapshot selector or revisioned projection shared by these consumers.
4. Correct save revision wiring and test edits while encoding/writing. Dirty state must include metadata, not only source.
5. Test close-tab/reopen, delete/undo, project replacement and duplicate import identity.

**Exit gate:** a three-diagram project survives edit, checkpoint, save, reload, tab close/reopen and interrupted-save scenarios with source, histories, settings and links intact. Encrypted variants preserve their memory-only privacy boundaries.

## Priority 2 — Complete the single-file experience

The new storage model is simpler, but the interaction flow still exposes implementation leftovers.

Confirmed in `apps/web/src/projects/use-single-file-project.ts:107–393`:

- Add Diagram is typed for Gantt, Class and Sequence only; text import explicitly rejects the other families, although the editor supports six.
- New/import/open use browser prompts, including asking whether a native file has a password before format-aware handling.
- New diagram display names acquire `.pumlu`, although embedded diagrams are no longer separate files.
- Native open tries project decoding and then falls back to document decoding after any error, which can obscure the actual failure.

Recommended changes:

1. Reuse the six-type diagram chooser for Add and import all six supported source types. Linking may remain limited to supported element kinds; navigation and storage should not.
2. Show diagram names as names. Keep `.pumlu` only on the project save destination and explicit exports.
3. Replace native prompts with accessible New Project, Rename and Unlock dialogs. Inspect framing first; ask for a password only when encryption requires it. Cancellation should stop the operation cleanly.
4. Dispatch v1/v2 decoding by envelope version, preserving wrong-password, unsupported-version and corrupt-file errors.
5. Give the project header a clear name and saved/unsaved status. Ensure normal Save has one predictable target and that older folder/ZIP choices sit under import options.

**Exit gate:** a first-time user creates two different diagrams, links supported elements, saves one file, and reopens it without needing an explanation of tabs versus files versus projects.

## Priority 3 — Make link state trustworthy and repairable

Do this alongside the snapshot/index work rather than adding more relation types first.

- Refresh resolution from live source revisions, discard stale async results, and visibly indicate indexing or incomplete results.
- Show resolved, missing, ambiguous, and parse-error targets distinctly. The current indexing rejection path catches and discards errors; preserve the navigator but expose a useful diagnostic.
- Verify semantic rename and undo/redo for every supported endpoint, followed by a save/reopen cycle.
- Provide a direct repair action that shows old and proposed targets, rather than making the user recreate links.
- Show the relationship path behind each impact result and distinguish confirmed links from unresolved paths.

**Exit gate:** changing, renaming or deleting a linked element never leaves a silently stale “healthy” graph.

## Priority 4 — Measure whole-project performance

The existing baselines mainly cover Gantt parsing/rendering, a single inspector, and portable-document history encoding. They do not yet establish the cost of editing and saving a large multi-diagram project.

Add 10-, 50- and near-limit mixed-diagram workloads measuring:

- Keystroke → updated index and visible preview.
- Switching between already-open and unopened diagrams.
- Save/reopen with realistic history and encryption.
- Memory usage and cancellation during encoding/indexing.

Profile before changing architecture. Prefer caching by member/source revision and bounded background work; avoid reparsing every member after an unrelated display-name change. Move work into a Worker only where traces demonstrate a main-thread problem. Keep machine-sensitive thresholds out of correctness tests.

**Exit gate:** recorded reproducible project-level baselines and a responsive cancellation path for expensive operations.

## Priority 5 — Next substantial feature: project change review

Once project state is reliable, introduce a review against the **last successfully saved project snapshot**.

First slice:

1. A “Review changes” entry listing changed diagrams, added/deleted diagrams, changed links and renamed members.
2. Existing semantic comparison for supported diagrams, source comparison for the remainder.
3. Backlinks/impact paths alongside a selected change: “These linked items may need review.”
4. A clear difference between source changes, history/settings changes, and relationship changes.
5. A portable read-only review report after the interactive workflow proves useful.

Start with read-only review; defer selective multi-diagram application and additional project-history schemas. Retain the last saved snapshot locally for the active session initially and label when no baseline is available. Do not confuse the per-diagram historical baseline with the project save baseline.

**Success measure:** pilot users can correctly explain a multi-diagram change faster than by opening each diagram and checking source diffs separately. Validate with actual project changes, not only a prepared demonstration.

## Work order and rough effort

Estimates assume one developer and must be revised after reproductions.

| Order | Deliverable                                                          | Rough effort |
| ----- | -------------------------------------------------------------------- | ------------ |
| 1     | Lifecycle reproductions and complete snapshot/save/recovery contract | 4–8 days     |
| 2     | Six-type project flow, clean names and format-aware dialogs          | 3–5 days     |
| 3     | Live link state, errors and repair; rename persistence checks        | 3–6 days     |
| 4     | Mixed-project performance baseline and measured fixes                | 2–4 days     |
| 5     | Read-only project change review                                      | 1–2 weeks    |

Keep each implementation task scoped to one state boundary and its tests. Use Graft for context and the extracted diagram controllers for local changes. Avoid simultaneous refactoring of the app shell and changes to persistence semantics.

## Verification performed and limits

Ran these existing targeted suites:

```sh
./node_modules/.bin/vitest run \
  apps/web/src/projects/embedded-project.test.ts \
  apps/web/src/projects/embedded-project-save.test.ts \
  apps/web/src/projects/embedded-project-session.test.ts
```

Result: **3 files, 6 tests passed**. This confirms the tested helpers, not complete hook/UI integration. In particular, a coordinator test can pass while its caller supplies a constant revision getter.

No deployed UI inspection, full validation, browser suite, security audit or performance run was performed for this reassessment. The findings above distinguish observed source behaviour from lifecycle risks that still need reproduction.

## Defer

Additional diagram formats, another storage redesign, broad AI generation, enterprise administration, and a general rewrite. The app now benefits most from making its existing project workflow dependable and coherent, then turning that foundation into useful project-wide review.
