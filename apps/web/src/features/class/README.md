# Class feature boundary

This directory owns Class-specific UI, source mutations, and interaction state.

- `ClassDialogs.tsx` composes entity, relationship, package, and note dialogs.
- `ClassInspectors.tsx` composes settings and selected-object inspectors.
- `use-class-actions.ts` owns source mutations, rename propagation, ordering, reconnects, package moves, and feedback.
- `use-class-controller.ts` owns object and member selection, source highlighting, settings visibility, and source reveal.

`App.tsx` supplies the active source and parsed document, commits changes, and connects the feature to shared editor
services and the Class diagram preview.
