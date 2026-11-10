<!-- trail:start -->

## Trail — repo context graph

This repo is indexed in `.trail/cache/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `trail map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `trail ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `trail grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `trail skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `trail callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `.trail/cache/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `trail ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `trail build` (deterministic,
no API key, $0).
<!-- trail:end -->

## Codex token efficiency

- Keep each task focused on one deliverable. When it is complete, recommend a
  fresh task for unrelated work; do not create tasks or interrupt ongoing work
  automatically. For a handoff, record only the goal, decisions, changed files,
  validation results, and next action. Avoid copying conversation history.
- Reuse findings already in context. Run repo orientation once per task; keep
  `graft map` compact with `--max-dirs 3`. Use literal symbols and scoped graph
  queries for follow-up reads. Treat ranked matches as leads to verify, not
  proof that the first result answers the question.
- Bound tool output to the evidence needed for the next decision. Start routine
  searches and reads with a 2,000-token output budget; expand when necessary.
  For long test/build output, save the log to a temporary file, preserve the
  command's exit status, and return a summary plus relevant failures. Inspect
  missing details rather than repeatedly dumping the entire log.
- Batch independent checks when practical. After appropriate validation passes,
  repeat it only for changed code, a failure, or an unresolved risk. Inspect
  screenshots when visual evidence is needed; reuse unchanged screenshots.
- Report measured session input, cached input, and output separately when
  evaluating efficiency. Graft's whole-file comparison is a hypothetical
  retrieval estimate, not measured Codex token or billing savings. Serialized
  image bytes are not text-token counts.

### Testing for agents

- Iterate on one spec, one browser:
  `npm run test:e2e:agent -- <spec> --project=chromium` (add `--grep "<title>"`
  for a single test). Output is dot-style, stops after 3 failures.
- Run all 3 browsers (chromium, firefox, webkit) for the touched specs only,
  right before pushing. Never run the full e2e suite while iterating.
- Wrap long commands (`npm run validate`, builds, full unit runs) in
  `scripts/quiet-run.sh <cmd...>`: full log goes to a file, you see the path,
  exit status, tail and failure lines.
- Prefer `trail skeleton <file>` over reading large files such as `App.tsx`
  (~3.5k lines) or `styles.css`, which is now only an `@import` index (rules live in ordered chunks under `apps/web/src/styles/`; import order is cascade order, so never reorder or regroup them).
- Audit screenshots: e2e specs that write tracked PNGs under `docs/audits/` do
  so only when `AUDIT_SCREENSHOTS=1` is set (via
  `tests/e2e/audit-screenshot.ts`). The default is off, so e2e runs leave git
  clean. Set the flag only to refresh the committed audit images.
