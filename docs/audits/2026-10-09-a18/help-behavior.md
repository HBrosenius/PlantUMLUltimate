# A18 — Searchable contextual Help

Help starts with the active diagram, followed by General and Editing. All diagrams and All shortcuts & gestures expose the full reference. Search matches topic titles, prose, syntax examples, action names and shortcut labels; matching prose is narrowed to relevant paragraphs. Matching optional tour/release-note sections open automatically. Empty results explain how to broaden the scope.

Shortcut search accepts Command/Cmd/Ctrl/Control and Option/Alt aliases, native glyphs, spacing and modifier order. Labels use the local platform's primary modifier. Gantt task reordering intentionally remains Control on both platforms because its handler checks ctrlKey.

Bindings were checked against:

- App's keyboard handler: document commands, views, Outline, Commands, Help and family-specific creation shortcuts.
- CodeEditor's keymaps: source fixes, Explain error, diagnostic navigation and rename.
- DiagramPreview's keyboard handler: task navigation, move, resize and Control-based reordering.

No keyboard handlers changed. Sequence participant/message shortcuts are now documented beside Sequence guidance. Help still documents selection, copy/paste/duplicate, snapping, tab actions, syntax, scheduling, diagnostics, recovery and file saving.

Validation: four new unit checks cover platform labels, typed shortcut search, scope/no-result recovery and prose filtering. Full unit suite: 196 files / 2,148 tests pass. Six new browser journeys pass in Chromium, Firefox and WebKit, covering every diagram context, the actual Sequence creation shortcut, focus, Escape and a 390 × 844 viewport. The existing startup-to-Help tour was also checked across the three browsers. Production build, changed-file lint/format and whitespace checks pass. Phone evidence is a browser viewport rather than a real software keyboard test.
