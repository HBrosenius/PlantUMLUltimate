# Architecture

PlantUML source is the only persistent document representation. Parsing, diagnostics, completion, rendering, and visual interactions consume that source; visual changes will produce minimal source edits.

The web application owns UI wiring only. Language and diagram semantics live in framework-independent workspace packages. Rendering crosses an asynchronous iframe boundary and every request carries a monotonically increasing ID, preventing stale responses from replacing newer previews.

Canonical SVG is produced by the official `@plantuml/core` TeaVM build. The engine requires a DOM, so it runs in a hidden dedicated iframe following the official PlantUML integration architecture and communicates through `postMessage`. Requests are serialized because the engine uses shared internal state. A semantic SVG overlay derives task geometry from canonical labels and bars without using a second persistent document model.

## Diagram adapters

`@plantuml-studio/language-core` defines framework-neutral contracts for parsing, diagnostics, completion, interactive objects, capabilities, and source-edit-producing visual operations. `@plantuml-studio/language-plantuml` detects PlantUML diagram types and provides an adapter registry. The web application configures that registry once in `diagram-adapters.ts`; application code obtains registered adapters and queries source capabilities through that module instead of constructing registries or importing the Gantt adapter directly.

`@plantuml-studio/diagram-gantt` supplies the first concrete adapter. The web application resolves it through the configured registry, parses the active source through it, and routes core task movement, resizing, reordering, dependency creation/deletion, and Jira schedule resizing through its typed visual-operation API. React and CodeMirror types do not cross the adapter boundary.

`@plantuml-studio/diagram-wbs` models hierarchical work-breakdown nodes, diagnostics, completions, and source-preserving subtree operations. Its preview uses the canonical PlantUML SVG with a semantic node interaction layer; the hierarchy model is derived from source and is never persisted separately.

Gantt is the proof that the registry can be the production routing boundary. WBS is registered for detection and capability discovery but still uses its specialized web integration for parsing and edits. Sequence, Use Case, Class, and Activity remain specialized implementations until their adapter contracts can preserve their richer source constructs. Registration therefore describes the current application boundary; it does not imply that all six diagram types have completed adapter migration.

To add a diagram type:

1. Add detection for its `@start…` directive if it is not already known.
2. Implement `DiagramAdapter<TModel, TOperation>` in a framework-independent package.
3. Register the adapter with `DiagramAdapterRegistry`.
4. Provide a diagram-specific preview interaction layer only for capabilities marked as supported.

## Web application hooks

The app shell composes UI and delegates stateful infrastructure to hooks. `useDocumentHistory` owns per-tab undo histories and lifecycle cleanup. `useResourceCapacities` owns per-document capacity persistence and resource renaming. This keeps tab-specific state isolated while reducing responsibilities in the application shell.
