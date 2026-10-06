# Nested block validation and repair audit

Verified with the official `@plantuml/core` renderer, PlantUML 1.2026.6.

The 100-case corpus includes 12 valid controls and 88 mutations of nested Activity controls, Sequence fragments/boxes/notes/references, and Class/Component/Use case containers. Mutations remove, mistype, replace, or duplicate closing terminators. All 88 mutations receive editor diagnostics. The renderer rejects 20, all detected locally; it tolerates the other malformed structures, so rendering alone is not a sufficient validation check.

Before the change, 76 repair candidates included 28 equivalent drawings, 40 changed drawings, and eight still rejected inputs. After the change, all 47 offered candidates restore their source exactly and reproduce the baseline drawing. Ambiguous closer positions and removals remain manual. Repeat loops require the user's condition rather than an invented placeholder.

The checker also preserves all 428 saved official examples. It recognizes Sequence partitions and shaped-note closers, plus Activity end/stop, endfork, end merge, repeatwhile, and end fork {or} forms. The two Sequence examples have additional editor-level regressions.

One previously recorded Class mutation repair is now withheld because deleting a later brace can change nested boundaries. Its prior renderer rejection is retained under `withheldRepairs` in `renderer-observations.json`; the old audit snapshot removes only that candidate.

## Reproduce

```sh
PLANTUML_NESTED_EXPORT=/tmp/nested-blocks.json npx vitest run apps/web/src/nested-block-audit.test.ts
node scripts/audit-plantuml-renderer.mjs /tmp/nested-blocks.json /tmp/nested-blocks-rendered.json
```

The regression fixture `tests/fixtures/official-plantuml/nested-block-renderer-audit.json` pins source hashes, diagnostics, repair hashes, and rendering outcomes. Review any change before replacing it. The corpus proves the tested cases; it does not establish exhaustive PlantUML syntax coverage.
