# Sequence feature boundary

This directory owns Sequence-specific UI and interaction state.

- `SequenceDialogs.tsx` composes participant, message, and structure dialogs.
- `SequenceInspectors.tsx` composes settings and object inspectors.
- `use-sequence-actions.ts` owns source mutations, rename propagation, ordering, reconnects, and feedback.
- `use-sequence-controller.ts` owns exclusive selections, source highlighting, settings visibility, and source reveal.

`App.tsx` supplies the active source and parsed document, commits changes, and connects the feature to shared editor services.
