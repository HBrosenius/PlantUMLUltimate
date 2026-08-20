# Rendering

The application renders canonical SVG with the official `@plantuml/core` browser build. The engine and its Graphviz support are emitted as separate static assets and loaded lazily inside a hidden renderer iframe. No source is sent to a server.

The renderer serializes requests, uses monotonically increasing request IDs, debounces edits by 150 ms, caches the 50 most recent successful source/SVG pairs, and ignores stale results. PlantUML represents syntax failures as error-diagram SVGs; these are detected and surfaced as render errors while the last successful preview remains visible.

PlantUML SVG does not expose stable semantic task IDs. A derived, disposable overlay matches parsed task labels to canonical Gantt bar geometry and adds transparent interaction targets for selection, dragging, resizing, and dependency operations. PlantUML source remains the only persistent document representation.
