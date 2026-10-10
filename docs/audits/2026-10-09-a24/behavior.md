# A24 — Reusable personal starters

File → Save as starter… saves a reviewed snapshot of the active diagram. File → New → Personal starters offers review/create, remove, import and export. Existing examples and document destinations remain available.

- Source and authored styles survive reuse; new file/document identities are independent. Editing a copy leaves its original and stored starter unchanged.
- Gantt review exposes project start, fixed dates, resources and links. Optional removal applies to supported task assignments/links only. Changing project start does not rebase fixed dates or calendar exceptions. Editable source and final source preview allow explicit review.
- Local storage persists stable library IDs. Portable JSON excludes IDs and app bindings; importing creates fresh IDs. Entire imports validate before writing. Limits: 30 entries, 2 MB library, 500 KB source.
- Invalid source disables creation. Invalid imports, canceled dialogs and storage quota failures preserve current work. Phone storage errors scroll into view beside Save.
- No network rendering occurs merely to review a starter; creating uses the configured renderer. Starters capture a single diagram, not connected document graphs.

Validation: 202 unit files / 2,166 tests; 11 focused tests after final validation changes; production build; changed-file lint and formatting. Twelve starter journeys across Chromium, Firefox and WebKit plus three existing chooser regressions. Screenshots inspected: [personal library](a24-starter-review.png), [phone storage failure](a24-starter-phone.png).
