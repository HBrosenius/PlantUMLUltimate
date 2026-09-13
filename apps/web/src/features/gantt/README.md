# Gantt feature boundary

The Gantt feature is split by responsibility so changes do not require understanding the application shell.

- `GanttDialogs.tsx` and `GanttInspectors.tsx` compose Gantt-only UI.
- `use-gantt-task-actions.ts` owns task and milestone creation, duplication, and deletion.
- `use-gantt-dependency-actions.ts` owns dependency, divider, and vertical-separator edits.
- `use-gantt-calendar-actions.ts` owns project/calendar validation and date-rule edits.
- `use-gantt-schedule-actions.ts` owns moves, resizing, cascade previews, task scheduling, milestones, resources, links, pauses, and notes.
- `gantt-resource-conflicts.ts` contains deterministic resource-overlap detection.
- `use-gantt-controller.ts` owns transient Gantt panels, date/legend state, resource filters, and schedule mode/preview state.

`App.tsx` supplies the parsed document, shared commit contract, project rename mapping, and cross-diagram selection. Source transformations belong in the action hooks or `@plantuml-studio/diagram-gantt`, not in the shell.
