# Use Case feature boundary

This directory owns the web editor's Use Case-specific UI and interaction state.

- `UseCaseDialogs.tsx` composes the add dialogs.
- `UseCaseInspectors.tsx` composes settings and object inspectors.
- `use-usecase-actions.ts` owns PlantUML source mutations and user feedback for Use Case operations.
- `use-usecase-controller.ts` owns selection, source highlighting, settings visibility, and selected-object lookup.

`App.tsx` remains the integration boundary: it supplies the active source and parsed document, commits source changes,
opens app-level dialogs, and connects the feature to the shared editor and diagram preview.
