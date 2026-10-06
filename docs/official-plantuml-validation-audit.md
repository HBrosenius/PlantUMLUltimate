# Official PlantUML validation audit — 2026-10-06

Audited every unique `@startuml` textarea extracted from the official [class](https://plantuml.com/class-diagram) and [use case](https://plantuml.com/use-case-diagram) pages. Offline corpus: 86 class examples and 27 use case examples. Runs the editor diagnostics, quick fixes, and parser preserved-syntax inventory. Example numbers refer to the ordered JSON fixtures.

| Kind    | Examples | With diagnostics | With repair suggestions | With preserved syntax |
| ------- | -------: | ---------------: | ----------------------: | --------------------: |
| class   |       86 |                0 |                       0 |                    39 |
| usecase |       27 |                0 |                       0 |                     4 |

## Resolved validation findings

- Class visibility prefixes, package stereotypes and gradient colors now parse without false closing-brace errors.
- Skinparam and JSON blocks preserve their source and prevent unsafe brace repairs. JSON braces inside quoted values do not affect block tracking.
- `together` groups retain their classes and correctly match closing braces.
- Class member notes, including quoted method signatures, no longer report unknown class targets.
- Repeated declarations with the same display name no longer report duplicate aliases. Conflicting display names sharing one alias still report errors.
- Case-distinct declarations such as classes `a`/`b` and packages `A`/`B` retain distinct IDs; existing IDs remain stable when unambiguous.
- Use case generalization relationships now introduce implicit actors and resolve forward aliases.

Preserved lines remain intentional visual editor limitations, including newer class declaration types, floating notes, colon member declarations, and trailing use case relationship styles. These pass through to PlantUML and are not validation errors.

## Repeatable checks

```sh
python3 scripts/refresh-official-plantuml-examples.py
PLANTUML_AUDIT_REPORT=/tmp/plantuml-audit npx vitest run apps/web/src/official-plantuml-audit.test.ts
```

Every captured example now explicitly asserts zero diagnostics and zero repair suggestions. The snapshot also catches changes in preserved lines. This validates compatibility with this corpus, not arbitrary syntax. Review corpus count changes and snapshot diffs after refresh; update expected counts and snapshots deliberately. Reports include example and line numbers for every issue.

Validation: all 1,933 unit tests pass, including the two audit tests against the captured corpus. This audit uses published examples as its reference; it does not run the official renderer or prove correctness for arbitrary syntax. Production parsers and brace repair validation now handle these examples. Unsupported visual editing features remain preserved as source.
