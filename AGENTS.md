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
- Local e2e runs use 4 parallel workers. Set `PW_WORKERS` to change that
  (`PW_WORKERS=1` to watch one test at a time); more than about 6 starves the
  renderer and makes Firefox C4 renders time out.
- Wrap long commands (`npm run validate`, builds, full unit runs) in
  `scripts/quiet-run.sh <cmd...>`: full log goes to a file, you see the path,
  exit status, tail and failure lines.
- Prefer `trail skeleton <file>` over reading large files such as `App.tsx`
  (~3.5k lines) or `styles.css`, which is now only an `@import` index (rules live in ordered chunks under `apps/web/src/styles/`; import order is cascade order, so never reorder or regroup them).
- Audit screenshots: e2e specs that write tracked PNGs under `docs/audits/` do
  so only when `AUDIT_SCREENSHOTS=1` is set (via
  `tests/e2e/audit-screenshot.ts`). The default is off, so e2e runs leave git
  clean. Set the flag only to refresh the committed audit images.
