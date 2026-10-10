# A14 inspector behavior — 2026-10-09

This delivery preserves the existing commit handlers. Shared panel feedback identifies Applied, Unapplied changes, or Invalid changes and states whether Apply is required. Native validity and the existing semantic invalid-draft flag feed the status; existing discard guards continue to protect closing and selection changes.

| Area                      | Result                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gantt task                | Name, schedule and progress precede dependencies and optional fields. Text fields retain blur-to-apply; immediate controls retain their existing handlers.                                                                            |
| Optional task sections    | Empty Appearance/Resources start collapsed. Populated sections start open unless a remembered choice overrides the default. Choices persist by section in browser storage. Invalid fields reveal their section and show Check values. |
| Calendar & schedule       | Project start, scale, working days and calendar exceptions precede page title/header/footer/caption. Edits remain staged until Apply.                                                                                                 |
| Sequence message creation | From, To and Message lead. Editable endpoint comboboxes expose a visible participant picker while allowing new names. Lifecycle, Teoz anchor and edge/found/lost options remain available under Advanced with examples.               |
| Other properties          | Shared status and existing immediate/staged commit behavior remain in place; this is not a conversion to live Apply.                                                                                                                  |
| Selection gestures        | Editing help explicitly describes one click. Double-click behavior is checked for source preservation rather than changed; dragging, keyboard selection and semantic rename remain independent.                                       |

Optional-section storage failure falls back to the mounted choice. Invalid drafts take priority over remembered collapse. Sequence participant pickers support arrows, Enter, Escape, mouse selection and custom input; dismissing the picker leaves the creation dialog open.

Mobile validation uses constrained browser viewports, not a real touch device or software keyboard. No gesture harmonization or source scheduling changes are introduced.

Validation: 195 unit files / 2,141 tests pass; 12 new cross-browser checks and 23 existing regression checks pass, with one pre-existing WebKit skip. Production build, changed-file ESLint/Prettier and whitespace checks pass. Desktop and 390 × 844 task and Sequence screenshots were inspected. WBS pointer verification uses real mouse coordinates for WebKit's transparent SVG hit area; no forced DOM clicks are used.
