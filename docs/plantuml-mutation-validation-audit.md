# Controlled-error validation and repair audit — 2026-10-06

Compared 523 deterministic mutations of all 113 official class and use case examples with the installed official [`@plantuml/core`](https://github.com/plantuml/plantuml) renderer, version 1.2026.6. Every original example rendered successfully. All rendering ran locally; external requests were blocked.

## Results

- The renderer rejected 257 mutations. Local validation reported errors for 82 (31.9%) and missed 175.
- Of 310 individual repair candidates, 283 restored the original drawing: 242 restored the exact source and 41 produced matching normalized SVG.
- 27 individual repair candidates remained invalid. Some individual fixes may require other fixes; the audit also tested every batch with nonoverlapping edits and no unresolved alternative choices.
- No remaining repair candidate produced a changed drawing. No mechanically compatible batch remained after ambiguous repairs were withheld. Previously, 14 individual candidates and 3 compatible batches produced changed drawings.
- No renderer runtime failures or timeouts occurred.

| Mutation                  | Cases | Renderer rejected | Local errors on rejected cases |
| ------------------------- | ----: | ----------------: | -----------------------------: |
| duplicated-closing-brace  |    46 |                34 |                             29 |
| missing-closing-brace     |    46 |                21 |                             16 |
| missing-closing-tag       |   113 |                 0 |                              0 |
| missing-declaration-quote |     4 |                 4 |                              4 |
| missing-note-terminator   |     6 |                 3 |                              3 |
| misspelled-declaration    |    82 |                82 |                             30 |
| misspelled-opening-tag    |   113 |                 0 |                              0 |
| unknown-command           |   113 |               113 |                              0 |

## Findings and next fix scope

1. **Missing validation:** arbitrary unknown commands (113 cases) and misspelled declarations (52 cases) remain silent. Five missing-brace and five duplicated-brace rejections also go undetected. Preserved syntax is not a complete grammar validator; avoid treating an empty Problems panel as proof of renderer validity.
2. **Fixed: repair placement could alter scope.** End-of-diagram class/package closers are now withheld when later statements, sibling packages, or combined closing braces make scope uncertain. This protects class 22–23, 38, 40–41, 82–85 and use case 8. Existing errors remain visible for manual placement. Simple unambiguous closures still receive repairs.
3. **Fixed: missing note terminators could absorb later declarations.** Ambiguous note repairs in class 55 and use case 12 are now withheld and retain a missing-note diagnostic. Existing closing diagram tags are recognized instead of duplicated. The terminal note in class 24 is safely closed before trailing blank lines, restoring the exact original source.
4. **Removing a closing brace does not repair a misspelled declaration:** these candidates still fail the official renderer. Nested duplicated closers can also leave an unrelated “close package” candidate that is not sufficient on its own.
5. **Do not classify every mutation as invalid:** the renderer accepts missing final `@enduml` and the tested `@startumlx` opening marker, and tolerates some missing/duplicated braces or note terminators. Local boundary conventions can still be stricter, but these are not renderer syntax rejections.

## Reproduce and inspect without manual searching

```sh
# Generate controlled errors, current diagnostics, individual edits, and mechanically compatible edit batches.
PLANTUML_MUTATION_EXPORT=/tmp/plantuml-mutations.json npx vitest run apps/web/src/official-plantuml-mutations.test.ts

# Requires the existing Playwright Chromium installation; no Java or external renderer.
node scripts/audit-plantuml-renderer.mjs /tmp/plantuml-mutations.json /tmp/plantuml-oracle-results.json tests/fixtures/official-plantuml/renderer-observations.json

# Review updated observations and regression snapshot deliberately.
npx vitest run apps/web/src/official-plantuml-mutations.test.ts
```

The export supplies source for each original, mutation, and repair. The full renderer report supplies case IDs (`class-22-missing-closing-brace`), renderer error text, SVG fingerprints, labels, and individual/batch outcomes. The checked-in compact observations pin input hashes, engine version, diagnostics, repair hashes, validity, and drawing equivalence; offline tests reject stale observations and snapshot the complete inventory of known misses and mismatches. If a deliberate validator change alters inputs or repair candidates, regenerate observations and review snapshot changes.

## Verification limits

Drawing equivalence compares normalized SVG, including paths, arrows, labels, and grouping. Source comments/metadata and generated IDs are excluded. Matching drawings are stronger evidence than matching labels, but do not prove arbitrary semantic equivalence. Different drawings flag review candidates; layout differences alone can also produce a mismatch.

Renderer controls verify a valid diagram, a known invalid declaration, harmless whitespace, reversed arrow direction, and a valid note containing “Syntax Error?”. No error callback or timeout is treated as successful rendering. A missing browser or runtime failure fails the live audit; it does not count as a syntax rejection.

Production quick fixes now withhold ambiguous class/package/note closures. The mutation audit asserts that every renderer-accepted repair matches the original drawing, while recording remaining invalid repair candidates and missed syntax errors. It never auto-applies repairs.

Validation: all 1,959 unit tests pass; workspace type checking, targeted lint, and formatting checks pass. The live official renderer audit verifies all 523 mutation cases.
