# PlantUML keyword validation audit

Audited 2026-10-06 across all seven supported diagram kinds. The target is the reported class of defects: misspelled statement keywords and directives silently ignored by local validation. This is a bounded mutation audit, not proof of complete grammar validation.

## Results

| Diagram   | Mutations | Errors detected before | Exact fixes before | Exact fixes after |
| --------- | --------: | ---------------------: | -----------------: | ----------------: |
| Sequence  |        35 |                     35 |                 35 |                35 |
| Class     |       195 |                     27 |                  0 |               195 |
| Component |       197 |                     27 |                  0 |               197 |
| Usecase   |       116 |                     35 |                  0 |               116 |
| Activity  |       191 |                    122 |                  0 |               191 |
| Gantt     |       101 |                      0 |                  0 |               101 |
| Wbs       |        35 |                      0 |                  0 |                35 |

All 870 mutations now have a diagnostic and a correction restoring the exact original source. The official `@plantuml/core` 1.2026.6 renderer rejected 868 mutations. It accepted two (`usecas` and `databas`) but produced different drawings. All 870 corrected drawings match their valid baselines, with zero drawing-changing repairs or repairs still rejected. All baseline sources rendered successfully.

The new keyword scanner leaves 428 unique official examples unchanged: Class 86, Use Case 27, Component 35, Activity 75, Gantt 98, WBS 18, Sequence 89. These compatibility assertions apply to keyword corrections; other validators may have independent gaps.

## Scope and safeguards

The inventory automatically generates single-character deletion, duplication, substitution, and adjacent transposition cases for common `skinparam` directives, Class and Use Case declarations, Component declarations and containers, Activity start/stop/control statements, and Gantt project/scale directives. Existing Gantt clause and diagram-boundary mutation tests remain in the suite. WBS node text has no declaration keyword, so WBS coverage here targets common directives.

Shared keyword repairs apply through the editor diagnostic and quick-fix APIs. Unique near-matches require a compatible statement tail. Notes, reference blocks, comments, multiline title/header/footer/legend text, multiline Activity actions, styles, JSON, skinparam bodies, and class members are protected. Container contents remain eligible for declaration checks. Existing specialized corrections take precedence to avoid duplicate suggestions and obsolete block closers. Sequence retains its standalone keyword validation.

## Reproduce

Download examples explicitly (normal tests remain offline):

```sh
python3 scripts/refresh-official-plantuml-examples.py --kinds component activity gantt wbs sequence
```

Export the current audit and render it:

```sh
PLANTUML_KEYWORD_EXPORT=/tmp/keyword-after.json npx vitest run apps/web/src/diagram-keyword-audit.test.ts
node scripts/audit-plantuml-renderer.mjs /tmp/keyword-after.json /tmp/keyword-rendered.json
```

Set `PLANTUML_KEYWORD_BASELINE=1` to disable the new shared keyword scanner in the test inventory, reproducing before-change counts. The saved summary pins the live audit to a SHA-256 of its complete source and repair inventory; changes require a new renderer audit.
