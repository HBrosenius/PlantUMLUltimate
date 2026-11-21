# AI-assisted edits through the review pipeline — plan

Status: plan only, nothing implemented. Written 2026-11-22. Item B1 in
[next-steps-2026-11-20.md](next-steps-2026-11-20.md); feature set 4 in the
[feature strategy](feature-strategy.md).

Goal: select part of a diagram, describe a change in plain words ("add a
timeout path to this call"), and get a PlantUML proposal that has already been
parsed, checked and rendered. The proposal is shown in the existing semantic
review, where the user accepts it group by group, and it lands as one undo
step. Nothing is applied automatically and nothing leaves the device until the
user has turned the feature on and seen what will be sent.

## 0. What already exists

The AI only has to produce source. Almost everything after that is built:

- **Semantic review.** `buildReviewGroups(left, right, kind)` in
  `apps/web/src/semantic-review.ts:638` groups a source change into named,
  confidence-rated groups for Sequence, Gantt and Class.
  `applyReviewGroups(left, groups, selectedIds)` (`:1004`) applies the chosen
  ones. Today only `VersionHistoryDialog.tsx` uses them (`:116-120`).
- **Guarded apply.** Version history applies through
  `onApplyReview(source, expectedSource)` (`VersionHistoryDialog.tsx:74`), which
  refuses when the document changed underneath. The same path gives unified
  undo (ADR 0006).
- **Three-way merge.** `threeWayMerge(base, local, external)`
  (`apps/web/src/external-file-merge.ts:70`) can carry a proposal over edits
  made while it was being generated.
- **Diagnostics.** `analyzeDiagram` (`apps/web/src/diagram-diagnostics.ts:272`)
  and the per-kind parsers (`packages/diagram-sequence`,
  `packages/diagram-gantt`) say whether a proposal parses and whether it adds
  errors.
- **Local rendering.** The renderer runs in a sandboxed frame driven by
  `useRenderer` (`apps/web/src/render/use-renderer.ts:38`) with request ids and
  cancellation. It is tied to the visible preview today; a proposal needs its
  own render request (see A2).
- **Entry point.** Stage's "Ask or do…" button
  (`apps/web/src/stage/StageTopBar.tsx:75`) opens the command palette, so a
  palette command is reachable from both layouts.
- **Network.** The page CSP already allows `connect-src https:`
  (`apps/web/index.html:9`). The integration Worker
  (`apps/integration-worker/src/index.ts`) has origin checks
  (`requestOriginAllowed`), size-limited JSON and session cookies stored in D1,
  which is the pattern a proxy would follow.

Missing: a provider client, settings and consent, a proposal dialog, a render
check for a source that is not on screen, and the review panel as a component
of its own.

## 1. Decisions needed from you

Each has a recommendation. Nothing in A0 depends on them, so they can wait
until A0's numbers are in.

- **Q1 — Whose API key?**
  (a) **Bring your own key, in the browser** (recommended first). The key goes
  straight from the browser to the Anthropic API. It is kept in memory for the
  session by default, with an explicit "remember on this device" option that
  stores it in IndexedDB. It is never written to documents, backups, project
  files or collaboration state. No server cost or abuse risk for you, and it
  matches the local-first promise. The risk is that an XSS bug could read the
  key; the strict `script-src` and the SVG sanitiser are the defence.
  (b) **Proxy through the integration Worker** with an app-owned key. No key
  in the browser and no setup for users, but you pay for every request and need
  sign-in, per-user quotas and abuse limits.
  Recommendation: (a) now, (b) as slice A5 only if you want AI without setup.
- **Q2 — Default model.** Claude Opus 5.5 (`claude-opus-5-5`, $4 / $20 per
  million input/output tokens) gives the best patch quality. Claude Sonnet 5.5
  (`claude-sonnet-5-5`, $2 / $10) is cheaper and faster. With the user's own
  key this is mostly their cost. Recommendation: default to Opus 5.5 and offer
  Sonnet 5.5 as a setting; let A0's eval show whether Sonnet holds up.
- **Q3 — What context is sent.** (a) The whole document with the selection
  marked (recommended: the model needs aliases and existing participants to
  make a valid change), or (b) only the selected lines. Either way the user sees
  the exact text before the first send, and can open it on every request.
- **Q4 — Entry points for the first release.** Recommended: a palette command
  ("Ask AI to change the selection…", also reachable from Stage's "Ask or
  do…"), the source editor's selection, and the right-click menu on a
  Sequence message or participant.
- **Q5 — First diagram kind.** Sequence, as the report says: its semantic
  review is the strongest and the strategy's demo ("add timeout handling to
  this call") is a Sequence task. Gantt second.

## 2. How it works

### User flow

1. The user turns on **Settings → AI assistant** (off by default). A consent
   screen says which service receives the text, what is sent, that responses
   are proposals only, and where the key is kept. They paste a key and pick a
   model.
2. They select a message, a participant or source lines, and run "Ask AI to
   change the selection…". A small dialog shows the selection, an instruction
   box and a collapsed **"What will be sent"** section with the exact payload.
3. On send, the dialog streams a short progress line ("Drafting…",
   "Checking…") and can be cancelled.
4. The proposal is checked (below). If it fails, the dialog shows why and
   offers one automatic retry with the errors fed back, or "Edit instruction".
5. If the model needs information it does not have ("Which service times
   out?"), it returns questions instead of inventing an answer. The dialog shows
   them and the user answers or rephrases.
6. A valid proposal opens in the review panel: the model's one-paragraph
   summary, a rendered before/after, and the semantic groups with checkboxes.
   Groups that touch lines outside the selection are marked "outside your
   selection" and start unchecked.
7. **Apply** writes the chosen groups as one source edit and one undo step.
   Nothing is applied without this click.

### Request

- One Messages API call per attempt through the official TypeScript SDK
  (`@anthropic-ai/sdk`, created with `dangerouslyAllowBrowser: true` for
  option Q1a). No tools and no agent loop: the model can only return text.
- **System prompt** (stable, cached): the role, PlantUML rules for the kind,
  source-preservation rules (keep comments, aliases, order and unknown syntax;
  change only what the instruction needs), and the output contract. Put it
  first with `cache_control` so repeated requests reuse it.
- **User message** (changes per request): diagram kind, the document with the
  selection wrapped in markers, the instruction, and on a retry the diagnostics
  from the previous attempt.
- **Output** through structured outputs (`output_config.format` with a JSON
  schema): `{ revisedSource, summary, questions[] }`. `revisedSource` is the
  whole revised document, so the review diff, not the model, decides what
  changed. If `questions` is non-empty, `revisedSource` may be empty.
- Streaming, so long documents do not hit timeouts and the dialog can show
  progress; the app waits for the final message before checking.
- Handle `stop_reason` before reading content: `refusal` (show the reason,
  apply nothing), `max_tokens` (offer a retry with a smaller selection). Use
  the server-side refusal fallback (`fallbacks: "default"`) unless you'd rather
  not.
- Limits: refuse sources over a size cap (start at 100 KB) before sending;
  `AbortController` for Cancel; typed SDK errors mapped to plain messages (bad
  key, rate limited, network).

Check the exact SDK calls and beta flags against the live docs when A1 starts;
this section describes the shape, not final code.

### Checks before review

A proposal reaches the review panel only if all of these pass:

1. **Parses** with the kind's parser.
2. **No new errors.** `analyzeDiagram` on the proposal reports no error that
   the original did not have. New warnings are shown, not blocking.
3. **Renders** in a separate render request (A2), within the normal size
   limits, with the normal SVG sanitiser.
4. **Something changed**, and the change is not a wholesale rewrite: if more
   than a set share of untouched-by-selection lines changed (start at 30%),
   say so and ask the user to confirm before review.
5. **Not stale.** If the document changed while the request ran, rebase the
   proposal with `threeWayMerge`; if that conflicts, discard it and say so.

### Review and apply

- Extract the review list from `VersionHistoryDialog` into a `ReviewPanel`
  component (groups, checkboxes, details, rendered preview), with no change in
  version history's behaviour.
- The AI dialog hosts `ReviewPanel` with `left = current source`,
  `right = proposal`, and applies through the same guarded
  `onApplyReview(source, expectedSource)` path, so undo, collaboration sync and
  the "document changed" guard all come for free.

### Privacy and trust

- Off by default; nothing is sent until the user has turned it on, added a key,
  and pressed Send.
- "What will be sent" shows the exact system prompt, document text and
  instruction. Only the current document is sent: no other tabs, project files,
  repository files, Jira data or collaboration peers.
- The key never enters documents, backups, exports, share links or
  collaboration messages, and the settings page has "Forget key".
- Responses are data: the model has no tools, and its output can only become a
  proposal that passes the checks and the user's review. That limits the damage
  a prompt injection hidden in a shared diagram's comments could do to a bad
  proposal that the user sees before applying.
- In a collaborative session, the proposal is local to the user who asked; only
  the applied edit syncs, like any other edit.

## 3. Slices

- **A0 — Prompt and eval spike** (no app changes). A Node script in `scripts/`
  that runs about 30 Sequence tasks (add a failure path, rename a participant,
  add a timeout, insert an activation, split a message…) against the prompt and
  schema, then runs the parse/diagnostics checks and records valid-output rate,
  scope violations and cost per task, for Opus 5.5 and Sonnet 5.5. Runs on your
  key and costs real money, so it runs only when you start it. This is the
  success gate from the strategy: valid output or an actionable failure on every
  task. Small.
- **A1 — Settings, consent and provider client.** The AI assistant settings
  page, consent screen, key storage (memory or IndexedDB), model choice, the
  provider module with streaming, cancellation and error mapping, and the "What
  will be sent" view. No entry point yet. Unit tests with a mocked SDK. Medium.
- **A2 — Checks and review panel.** The validation pipeline (parse,
  diagnostics delta, rewrite share, stale rebase), a render request for a
  source that is not on screen, and `ReviewPanel` extracted from version history
  with its tests and e2e unchanged. Medium.
- **A3 — Sequence selection command.** The palette command, source-editor
  selection and message/participant context menu, the proposal dialog
  (instruction, progress, questions, retry), review and apply. E2E on the three
  browsers with the API mocked through Playwright route interception; CI never
  calls the real API. Medium–large.
- **A4 — Gantt.** Gantt-specific prompt rules and eval tasks ("split Backend
  into API and DB tasks", "add a review milestone after Testing"). Small–medium.
- **A5 — Worker proxy** (only if Q1b). A `/api/ai/messages` route on the
  integration Worker with sign-in, per-user daily quotas and request-size
  limits. Medium.
- **Later.** Other diagram kinds as their semantic review matures; "explain
  this dependency" and "repair this diagnostic" commands; local inference; the
  same bounded edit contract exposed to agents.

## 4. Risks

- **R1 — Low patch quality.** The model rewrites too much, drops comments or
  breaks aliases. Mitigation: source-preservation rules, the rewrite-share
  check, out-of-selection groups unchecked, and A0's eval before any UI.
- **R2 — Key exposure.** A browser-held key can be read by an XSS bug.
  Mitigation: session-only storage by default, the existing strict CSP and SVG
  sanitiser, "Forget key", and the Worker proxy as an alternative.
- **R3 — Cost surprises.** Large documents and retries add up. Mitigation:
  size cap, at most one automatic retry, and the token use shown after each
  request.
- **R4 — Invented content.** The model makes up services or steps.
  Mitigation: the `questions` field, an instruction to ask rather than guess,
  and the review step.
- **R5 — Prompt injection from shared diagrams.** Comments in a received
  diagram try to steer the model. Mitigation: no tools, output only becomes a
  reviewed proposal, and the full proposal diff is always visible.
- **R6 — Flaky e2e.** Real API calls would make CI slow and nondeterministic.
  Mitigation: all e2e mocks the API; only A0's eval calls it, by hand.
