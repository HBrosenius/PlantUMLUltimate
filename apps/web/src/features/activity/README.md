# Activity feature boundary

This directory owns the web editor's Activity-specific UI and interaction state.

- `ActivityDialogs.tsx` composes the add dialogs.
- `ActivityInspectors.tsx` composes settings and object inspectors.
- `use-activity-actions.ts` owns PlantUML source mutations and feedback for Activity operations.
- `use-activity-controller.ts` owns selection, source highlighting, settings visibility, and selected-object lookup.

`App.tsx` remains the integration boundary: it supplies the active source and parsed document, commits source changes,
opens app-level dialogs, and connects the feature to the shared editor and diagram preview.
