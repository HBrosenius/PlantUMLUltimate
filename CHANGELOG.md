# Changelog

All notable changes to PlantUML Ultimate are documented in this file.

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

[0.2.0]: https://github.com/HBrosenius/PlantUMLUltimate/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HBrosenius/PlantUMLUltimate/releases/tag/v0.1.0
