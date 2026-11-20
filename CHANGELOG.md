# Changelog

All notable changes to PlantUML Ultimate are documented in this file.

## [1.0.0] - 2026-11-13

First stable release. The document format, project files, Jira integration and collaboration protocol are now the baseline for future compatibility.

### Added

- **Portable documents and connected projects:** single-file PlantUML Ultimate documents that embed a whole project, a project navigator with live link status, links between diagrams and between Gantt tasks, linked diagrams opened from task hover cards, project-wide change review with exported reports, and saved what-if scenarios stored inside documents.
- **Semantic change review and version history:** review of diagram changes by meaning rather than text, rendered highlights in zoomable side-by-side comparisons, comparison of imported diagram versions, atomic review of Gantt dependencies, and compound Sequence changes grouped and linked to source.
- **Gantt forecasting and reporting:** progress-aware forecasts with completion visuals, explanations of project finish causes, resource-conflict previews, an editable forecast time zone, a reviewed apply-to-plan workflow, task check-in reports, delivery outlook and progress history, schedule reports with sorting and navigation to tasks, and baseline comparison of dependencies and project finish dates.
- **Delivery Scenario Lab:** interactive what-if planning with Gantt syntax editing and linked zoom and scrolling in the base plan preview.
- **Gantt scheduling and editing:** critical-path analysis with working-day slack, free and total slack on hover, filters for critical tasks, schedule validation with safe conflict repairs, task duplication, multi-select, relationship order repair, native PlantUML themes, and new charts that start from today with the current date highlighted.
- **Syntax repair and Problems workspace:** consolidated diagnostics and fixes with previewed replacements, repairs for keyword typos, missing brackets, quotes, boundaries and block terminators, explanations for manual repairs, and validation against official PlantUML examples.
- **More diagram editing:** visual Component diagrams, WBS node links, icons and multiline labels, WBS-to-Gantt conversion and in-node completion, Use Case connections by dragging between nodes, and PlantUML themes for every diagram kind.
- **Navigation and interface:** a command ribbon replacing the workspace menus, a searchable diagram outline that opens inspectors, Stage (an opt-in canvas-first view), onboarding and settings, a recent-changes menu, starter examples, more export options, zoom up to 1000 percent, and sharing of whole documents in live collaboration.
- **Help and discovery:** training videos and a course index in Help, a crawlable diagram guide, and improved search metadata.
- **Jira:** connections using API tokens, synchronized start and due dates, and live status for Gantt tasks linked to Jira issues, with a status badge on the bar, optional issue keys, a Jira section in the task card, and the same markers in exports (see `docs/jira-linked-tasks.md`).

### Changed

- Multi-diagram projects are called documents in the interface, and legacy import menu actions were removed in favour of single-file projects.
- Diagram zoom is stored in natural-size units, so 100 percent is the diagram's real size.
- File actions are grouped into submenus, with project and diagram opening kept separate.
- Internal: the application, Gantt, Class, Sequence, Activity, Use Case and WBS code was split into feature modules, and the stylesheet into ordered chunks, with no intended behaviour change.

### Improved

- **Performance:** lazy loading of diagram editors, reports, export, help, collaboration and bundled themes, a warm renderer that survives syntax errors and cancellations, renders cancelled when superseded, analysis reused between keystrokes, and faster opening, rendering and navigation of large documents.
- **Recovery:** preserved diagram scroll, selection and keyboard focus through edits, undo, dialogs and renders, recovery of healthy workspace copies when browser storage journals are damaged, and clear explanations of stale previews with consistent render recovery.
- **Exports:** guidance for oversized image exports, memory released after raster exports, and exports blocked unless the render is current.
- **Interaction:** smoother mouse wheel and touchpad zoom and scrolling, clearer editor selection contrast, undo that includes derived edits, and more reliable drags across browsers.
- **Release and delivery:** release gates for recoverable browser flows, faster pull-request validation, source-trusted Pages deployment, and documented verification and recovery.

### Fixed

- Gantt dependency, date, resource, same-row, hitbox, drag and resize problems, including forecast stability, time zones and resource workload.
- Version history and review mislabelling, such as replaced task starts and moved dependent tasks.
- WBS parent resolution that now matches PlantUML's depth-only rule, and unreadable WBS and mind map nodes in several bundled themes.
- Embedded project saves wrongly marked as unsaved, stale quick fixes after creating a document, and link indexes that re-dirtied saved projects.
- Collaboration snapshots echoing stale edits.
- Many Firefox, WebKit and Chromium interaction problems in menus, the startup chooser, toolbars and inspectors.

### Security

- Hardened the Workers, trust boundaries and credential transport, and the Jira session handling used by API-token connections.
- Tightened the page Content Security Policy, removing `data:` scripts, and fixed SVG sanitization boundaries.
- Guarded diagram links, fixed CodeQL alerts, and updated vulnerable dependencies.

## [0.2.0] - 2026-09-07

### Added

- Interactive WBS editing and complete visual editing workflows for Gantt, Sequence, Use Case, Class, Activity, and WBS diagrams.
- Semantic symbol highlighting, reference navigation, document-wide rename actions, diagram actions, and unified diagnostics across diagram types.
- Structured Class member and parameter editing with type reference completion.
- Gantt schedule analysis, start and end dependency anchors, live schedule conversion, and improved task, divider, and dependency interactions.
- Installable offline PWA support, operating-system PlantUML file handling, and update notifications.
- External-file change detection with three-way merging for concurrent local and external edits.
- Private-link live collaboration with editor and viewer roles, presence, attributed version history, link rotation, and persistent Worker-backed rooms.
- Remote-edit highlighting across source and diagrams, including participant attribution on Gantt changes.
- Jira integration for importing issues and blocking dependencies, reviewing synchronization changes, and publishing approved Gantt schedule updates.
- Automated deployment for the Jira integration Worker, including D1 migrations.

### Improved

- Keyboard accessibility, inspector focus behavior, mouse navigation for large diagrams, and cross-browser interactions.
- Immediate color-palette and dependency-inspector updates, with clearer visual color previews.
- Sequence structures, notes, references, and semantic references.
- Class package organization and member type references.
- Parser input bounds, generated-edit validation, renderer security, and collaboration security coverage.
- Production bundle caching, Safari rendering, and Chromium, Firefox, and WebKit CI coverage.
- Project documentation and custom-domain deployment behavior.

### Fixed

- Gantt dependency placement, separator dragging, task resizing, inferred dates, aliases, and resource preservation.
- Jira refresh behavior for dependencies, cleared fields, due-date-only issues, excluded tasks, and synchronization status.
- Selection and inspector stability across supported diagram editors.

## [0.1.0] - 2026-08-26

- Initial release of the local-first PlantUML editor.

[1.0.0]: https://github.com/HBrosenius/PlantUMLUltimate/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/HBrosenius/PlantUMLUltimate/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HBrosenius/PlantUMLUltimate/releases/tag/v0.1.0
