# ADR 0002: Diagram adapters

Status: Accepted

Diagram-specific parsing, diagnostics, completion, geometry, and visual operations are exposed through adapters. Generic editor and workspace packages do not depend on Gantt semantics.

The adapter contract lives in `@plantuml-studio/language-core`. PlantUML start-directive detection and the adapter registry live in `@plantuml-studio/language-plantuml`. Concrete adapters must remain independent of React, CodeMirror, and browser rendering APIs, and visual operations must return source edits rather than mutate a parallel document model.
