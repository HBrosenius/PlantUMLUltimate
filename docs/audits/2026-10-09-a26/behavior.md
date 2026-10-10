# A26 — Conservative source formatting

Format source… appears in source editor actions and the command palette. It previews changed lines using dots for leading spaces and arrows for tabs, with full proposed source available. Cancel leaves source unchanged. Apply commits through existing source validation/history as one “Format source” entry. One Undo restores exact source; Redo reapplies. Read-only and stale source/document previews cannot apply.

The formatter only normalizes recognized statement indentation, two-space UML brace/sequence block indentation and envelope whitespace. It preserves arrows, labels, member text, text-bearing tails, comments, multiline text blocks, blank lines and LF/CRLF endings. WBS body prefixes and labels remain byte-for-byte authored. It is idempotent.

Unknown statements, preprocessing/macros except a simple theme directive, multiline quoted declarations, continued lines, inline/unknown braces, unbalanced blocks and existing source errors withhold the entire change with a reason. Activity source, standalone CR endings and inputs above 500,000 characters or 5,000 lines remain unchanged. The diff renders 200 changed lines initially with Show more.

Validation: full unit suite 206 files / 2,200 tests before final recognizer tightening; 30 focused formatter/dialog tests afterward. Production TypeScript/Vite build; changed-file lint/format. Twelve browser journeys across Chromium, Firefox and WebKit cover cancel/apply, undo/redo, idempotence, macro refusal, palette and phone layout. Actual exported SVG text positions and shape geometry compare identically before/after for supported Gantt, Sequence, Class, Component, Use Case and WBS fixtures. These comparisons use export output, excluding temporary canvas hit targets whose bounds follow browser zoom.

Screenshots inspected: [phone diff](a26-format-phone.png), [unsupported macro explanation](a26-format-unsupported.png).

## Follow-up — Gantt task-relative dependencies

The first formatter recognizer withheld valid `starts at [Task]'s end` statements. It now recognizes start/end dependencies anchored to task start/end, including straight/curly apostrophes and supported before/after day/week offsets. Dependency text remains authored; leading indentation and the separator between the task name and its recognized starts/ends/lasts keyword are normalized. Generic refusal now identifies a formatter support limit rather than describing PlantUML as invalid.

The reported Architecture/Backend/Frontend/Testing example is accepted; the extra separator spaces before lasts are now normalized to one space. Whitespace inside task names, notes and other text, as well as blank lines, remains authored. Regression tests check dependency identities, relation, offset/direction and idempotence. All 37 focused formatter/dialog tests, production build, changed-file lint/format, and the three cross-browser render-equivalence journeys pass with a dependency in the Gantt fixture.

Follow-up: `[Architecture]      lasts 4 days` now becomes `[Architecture] lasts 4 days`. Separator tabs are handled too. The reviewed change remains one undo step and is idempotent. Validation: 38 focused tests, production build, changed-file lint/format and the existing three-browser exported-geometry fixture with the extra gap.
