# Relationship and operand validation audit

Audited with the official `@plantuml/core` renderer, PlantUML 1.2026.6.

The 82-case corpus includes incomplete relationships, missing arrow shafts, empty declarations, bare skinparam directives, missing Activity conditions, incomplete Gantt statements, and valid arrow controls. The renderer rejected 39 cases. Editor validation previously detected 9; it now detects all 39. All 428 saved official examples pass the new statement checks.

Eight missing-shaft repairs produce the same drawings as their valid controls. A missing Gantt dependency anchor offers explicit start/end choices: both render, but the start choice intentionally differs from the end baseline. Missing names, endpoints, colors and conditions require manual input. The invalid `colored in in` suggestion was removed.

Valid single-dash relationships in Class, Component and Use case diagrams remain accepted. Sequence messages can enter or leave without a named endpoint. Prose, class member bodies, parameter/style blocks and multiline labels are excluded from statement checks.

## Reproduce

```sh
PLANTUML_OPERAND_EXPORT=/tmp/operand-audit.json npx vitest run apps/web/src/relationship-operand-audit.test.ts
node scripts/audit-plantuml-renderer.mjs /tmp/operand-audit.json /tmp/operand-rendered.json
```

The checked-in `tests/fixtures/official-plantuml/operand-renderer-audit.json` records the engine results. The regression test verifies source and repair hashes, diagnostics and rendering outcomes against that record. Inspect rendering changes before replacing it; this bounded corpus is not exhaustive syntax coverage.
