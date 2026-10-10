# UI and product improvement plan

Date: 2026-10-09  
Reviewed checkout: `6174901`, including the existing working-tree state.  
Status: proposed work; no application changes made.

## Recommendation

Prioritize making existing capabilities easier to find and understand. The app already offers visual editing, source editing, searchable outlines, history, reporting, scenario analysis, connected diagrams, and collaboration. The strongest near-term opportunities are clearer entry points, shorter forms, better initial states, and a few concrete accessibility and responsive fixes.

Start with items Q1–Q6 below. Follow with report guidance, inspector hierarchy, and onboarding. Larger investments should extend the existing reporting, scenario, and connected-diagram foundations rather than introduce parallel systems.

## Review scope and evidence

The review used the repository's Graft graph, targeted source inspection, existing planning/results documents, and the running local development app on a fresh localhost origin. Live inspection covered:

- Welcome preferences and diagram/example creation.
- Gantt canvas, task properties, calendar settings, File/More menus, reports, and scenario analysis.
- Sequence controls and the Add message form.
- WBS canvas, linked-diagram menu, and searchable outline.
- Class diagram settings.
- Desktop at 1440 × 900, the initial narrow app pane, and WBS/Outline at 390 × 844.

Evidence labels used below:

- **Observed:** reproduced in the running app.
- **Source:** confirmed in inspected source, but the associated failure path was not exercised.
- **Proposal:** an opportunity inferred from the reviewed workflows; demand and full existing coverage need checking before implementation.

This was a usability review, not an exhaustive accessibility, performance, or browser-compatibility audit. Activity, Use Case, and Component editing were not exercised end to end. Authenticated Jira and collaboration sessions, saving to disk, export fidelity, recovery failures, and real touch devices were not tested. Development performance overlays were visible; they are not treated as a production UI defect.

### Preserve work already delivered

The [October 8 cleanup results](ui-cleanup-results.md) document direct Save/Save as, separate toolbars, shared resizable properties panels, draft protection, unified Issues, preview status, linked-diagram menus, tab context menus, Fit controls, and first-use hints. Several were also observed here. Do not reopen these as missing features. This plan builds on the [cleanup implementation plan](ui-cleanup-implementation-plan.md).

Effort is relative: **XS** = a localized label/style change; **S** = a contained interaction using existing behavior; **M** = several components and behavioral validation; **L** = a substantial workflow; **XL** = a cross-cutting product feature. These are estimates, not delivery commitments. P1 is the first implementation queue, P2 follows it, and P3 requires product validation.

## Quick improvements

### Q1. Keep Outline inside the mobile viewport

**P1 · S · Observed**

At 390 × 844, opening WBS → Outline produced a dialog with top 150, height 713, and bottom 863: 19 pixels beyond the viewport. Its footer was below the visible area.

- Constrain the dialog to available dynamic viewport height and safe-area insets. Keep its header/search/footer visible and scroll the results body.
- Check the shared modal positioning before applying a one-off override.
- **Done when:** the whole dialog shell fits at 390 × 844 and 320-pixel width; the last result and footer are reachable with keyboard and touch, including with the software keyboard open.
- **Starting point:** `apps/web/src/DiagramOutlineDialog.tsx:47–135`, associated styles.

### Q2. Give every icon-only close control a meaningful name

**P1 · XS · Observed + Source**

Class settings exposes its close button as “×”, while Gantt task properties exposes “Close task inspector”.

- Add an accessible name such as “Close Class settings”; apply the same check to Component mode and remaining panels.
- Preserve visible icons and existing focus restoration.
- **Done when:** inspected panel close controls have contextual accessible names; keyboard close returns focus to the relevant opener.
- **Starting point:** `apps/web/src/ClassSettingsInspector.tsx:27–39`.

### Q3. Finish the Problems → Issues terminology cleanup

**P1 · XS · Source**

Report error output still says “Open Problems”, although the workspace control is called “Issues”.

- Use the visible destination name and, where practical, make “Open Issues” an action rather than an instruction to hunt for another control.
- Search other user-facing error/help strings for the old term before declaring the migration complete.
- **Done when:** a report error directs the user to an existing, correctly named control and preserves report options while they investigate.
- **Starting point:** `apps/web/src/features/reports/ReportsDialog.tsx:502`.

### Q4. Make code discoverable from Diagram-only mode

**P1 · S · Observed + Source**

Accepting default onboarding leaves a single selected “Diagram” control. Code and Split are absent until the editing preference is changed in Settings. This makes a core capability hard to discover, especially when visual controls cannot express an edit.

- Add “Show code” beside the view control or expose all three view choices with a clear first-use transition.
- Reuse the existing editing-mode and view-state behavior; make the persistence of the choice explicit.
- **Done when:** a user starting with defaults can reach source editing in one obvious action without opening Settings, and returning to Diagram preserves source and selection.
- **Starting points:** `apps/web/src/App.tsx:1664–1670`; `apps/web/src/SettingsDialog.tsx:162–195`.

### Q5. Put planning tools together

**P1 · S–M · Observed**

Gantt analysis is under File, Reports is under More, and critical path/forecast are on the canvas. Related planning actions have unrelated entry points.

- Add a clearly labeled Gantt “Analyze” menu containing scenario analysis, reports, and relevant analysis views. Reuse existing handlers and keep command-palette access.
- Consider “What-if scenario…” as the entry label: the current dialog specifically promises testing schedule changes without altering the current plan.
- Retain existing routes temporarily where useful for learned behavior; avoid adding another full toolbar row.
- **Done when:** scenario analysis and reports can be found from the Gantt workspace without searching File/More; equivalent routes behave identically.
- **Starting point:** `apps/web/src/FileMenu.tsx:224–239` and the app toolbar/menu wiring.

### Q6. Give new tabs recognizable identities

**P1 · S · Observed**

Creating Gantt, Sequence, WBS, and Class diagrams yields `untitled.pumlu (1)` through `(4)`. The header still says `untitled.pumlu`. The numbers distinguish tabs but do not identify their content.

- Show a diagram-kind badge and a useful provisional label, such as “Sequence 1” or the diagram title.
- Keep display labels distinct from saved filenames; make the actual file/container available in the tooltip or secondary text.
- Reuse the existing rename route if available; do not add a competing rename mechanism.
- **Done when:** users can distinguish three unsaved diagram types and identify the active save target; accessible close names disambiguate identical filenames.

### Q7. Explain unsaved new documents more precisely

**P2 · S · Observed**

Fresh starter documents show “No unsaved changes”. This describes edit state, but can be read as confirmation that a file already exists on disk.

- Add a distinct “Not saved to a file yet” state when there is no successful file save/download record.
- Keep the existing distinction between browser recovery, file save, and download; do not imply that recovery is durable file storage.
- **Done when:** new, modified, successfully written, downloaded, and failed-save states have accurate wording, including after reload.
- **Dependency:** use the existing save coordinator's knowledge; do not infer saved state from the filename alone.

### Q8. Turn empty reports into actionable guidance

**P1 · S–M · Observed + Source**

Reports defaults to individual Task check-in messages. The starter Gantt has no assigned people, so the result shows “0 people · 0 unique tasks · 0 assignments” and disabled export controls, even though the task checklist contains tasks. The generic hint lists several possible remedies without identifying which one applies.

- Distinguish “No assigned people”, “No tasks in this date range”, and “All recipients/tasks excluded”.
- Offer the relevant action: “Use coordinator summary”, “Show all tasks”, or “Assign people”. Keep the change explicit rather than silently broadening the report.
- Show candidate-task and included-task counts separately when useful.
- **Done when:** the default unassigned starter has an obvious route to a useful report, and each empty state offers a remedy that actually works.
- **Starting point:** `apps/web/src/features/reports/ReportsDialog.tsx:502–525`.

### Q9. Simplify the first screen of Gantt properties

**P2 · S · Observed**

Task sections are collapsible but all were initially expanded. Dependencies appears before Schedule; common fields such as duration and completion need scrolling. New Gantt creation automatically opens Calendar & schedule, whose first fields are Title, Header, Footer, and Caption before Project starts.

- Put Name, scheduling basics, and “Progress (%)” first. Collapse optional Appearance and Resources by default when empty, preserving remembered preferences and invalid-draft visibility.
- In Calendar & schedule, put project start and working days before page annotations; group header/footer/caption under Presentation.
- Avoid changing commit behavior in this layout-only slice.
- **Done when:** common scheduling edits are visible with little scrolling and invalid fields remain discoverable when a section is collapsed.
- **Starting point:** `apps/web/src/TaskInspector.tsx:42–583`; existing Calendar & schedule inspector.

### Q10. Clarify schedule and zoom language

**P2 · XS–S · Observed**

The app exposes preview zoom, a “View” timeline preset, Time scale, and Scale zoom. Calendar settings already explains the distinction, but that explanation is far from the canvas controls. “Complete” does not visibly express percentage in the Gantt task label.

- Use “Progress (%)”, “Timeline scale”, and “Preview zoom” consistently.
- Label the current preset meaningfully; show concise help at the control where it matters.
- Explain working-day duration and calculated versus explicitly entered end dates next to schedule fields.
- **Done when:** choosing Day/Week/Month versus zooming has predictable meaning, and users can tell which edits change PlantUML source.

### Q11. Reduce permanent toolbar and hint space on narrow screens

**P2 · S–M · Observed**

At 390 pixels, WBS header/tabs/toolbars/hint occupied roughly the first 240 pixels. A single selected Diagram control took a separate row. The drag instruction also remains at the bottom of the canvas.

- Remove the redundant single-option view control once Q4 has a better entry point.
- Move secondary controls into a labeled overflow at narrow widths. Keep Add, search/Outline, save status, and the active diagram identity reachable.
- Make detailed gesture help available on demand after first use; preserve a way to reopen dismissed help.
- **Done when:** a phone-width workspace gains useful canvas height without hiding essential actions or creating horizontal page scrolling.

### Q12. Match scenario guidance to its selected editing mode

**P2 · XS · Observed**

Gantt analysis opens in “Task controls” but the impact panel says “Edit the scenario source to see delivery impact”.

- In task mode, say “Change task values, then choose Update scenario”; use source-specific guidance only in source mode.
- Label “0 days project duration” as a change/delta if that is the underlying metric, rather than appearing to describe total project length.
- **Done when:** the initial empty state explains the available next action and metric units without requiring source editing.

### Q13. Keep advanced Sequence fields out of the default path

**P2 · S · Observed**

Add message shows Message type, endpoints, arrow type, lifecycle modifiers, message text, and an optional Teoz anchor together.

- Lead with From, To, and Message. Put lifecycle/anchor and less common edge-message options under Advanced.
- Retain current descriptive arrow names and syntax previews; add concise examples for “found/lost” messages and anchors where selected.
- **Done when:** a basic message can be created without understanding Teoz or lifecycle syntax, while advanced choices remain keyboard-accessible and retain drafts.

### Q14. Make Outline search match the context it displays

**P2 · S · Source**

Outline rows display group/parent context, but filtering currently searches only label and type. Searching a WBS parent name therefore need not find its children, despite that parent being visible in each row.

- Include displayed group context in matching; consider aliases/IDs only if already present in the entry model.
- Add a clear-search action and an empty-state hint for active type filters.
- **Done when:** searching “Discovery” finds that WBS branch and its displayed child context; results and counts remain correct after clearing filters.
- **Starting point:** `apps/web/src/DiagramOutlineDialog.tsx:27–34`.

## Contained feature additions and workflow improvements

### M1. Start with the user's task, then offer preferences

**P2 · M · Observed → Proposal**

First use presents appearance/theme and editing preferences before a second dialog with seven diagram types and ten examples. The existing defaults button helps, but there are still two stages before editing.

- Combine the first-use path around Create, Open, and Try an example; make preferences an optional secondary step.
- Add small diagram thumbnails and organize choices into Planning and Software modeling. Keep every type accessible without forcing users to know the grouping.
- **Done when:** a default new diagram takes one choice from the start screen; optional preferences do not block opening a file.

### M2. Add a real blank/start-with-example choice

**P2 · S–M · Observed → Proposal**

Choosing a diagram type produces populated content; WBS creates a Website redesign tree even without choosing a named example.

- Distinguish “Blank diagram”, “Simple starter”, and named examples. Use the smallest valid source for blank diagrams and a useful empty-state Add action.
- Preserve the existing examples rather than create a second template catalogue.
- **Done when:** users can start their own diagram without deleting sample content, while newcomers can still choose a useful example in one step.

### M3. Preview themes before applying them

**P2 · M · Observed → Proposal**

Default diagram theme is a long list of names such as `cerulean`, `sketchy`, and `reddress-darkblue`; names alone do not predict the result.

- Add a small curated preview gallery with “All themes” available, using cached sample thumbnails where possible.
- Keep app theme, new-diagram default, and current-diagram theme clearly separated.
- **Done when:** a user can compare a few themes visually without repeatedly rendering their working diagram; cancel leaves the original choice intact.

### M4. Add report presets and progressive disclosure

**P2 · M · Observed → Proposal**

Reports already has eight report types and many controls. Task check-in shows scope/dates, people, layout, message wording, and individual exclusions together.

- Offer presets such as Team check-in, Coordinator summary, and Delivery outlook using existing report engines.
- Keep scope and preview visible; collapse wording and detailed exclusions until needed. Summarize all active filters beside the preview.
- **Done when:** a useful report can be produced by choosing a preset and date, and users can explain why any task was excluded.

### M5. Add an export preview and reusable export settings

**P2 · M · Source → Proposal**

File → Export currently exposes format actions directly. Extend this with a compact preview for dimensions, background, margins, and format, while preserving quick export.

- First inspect current PNG/PDF/SVG handlers so existing options are reused rather than duplicated.
- **Done when:** users can predict clipping, background, and text readability before downloading; export is tied to the current successful preview and its source version.
- **Starting point:** `apps/web/src/FileMenu.tsx:246–300`.

### M6. Provide a persistent outline/tree option for large diagrams

**P2 · M · Observed → Proposal**

The searchable Outline is already useful. Extend it with an optional docked mode and WBS hierarchy so repeated navigation does not require reopening a modal.

- Reuse the existing entries/search and coordinate layout with the navigator and properties panel.
- **Done when:** selecting an entry reveals the object, large lists remain responsive, and small screens retain the modal version.

### M7. Standardize feedback for applied versus staged field edits

**P2 · M · Observed + documented behavior**

Properties intentionally mixes blur-to-apply, immediate selects, and staged Apply forms. The shared shell and draft guards already exist; replacing them all is unnecessary.

- Show a consistent small “Changes applied” or “Unapplied changes” indicator in the panel header/footer, with the commit rule near the first editable field.
- Avoid automatic success announcements for every keystroke. Keep validation attached to the affected field.
- **Done when:** users know whether closing preserves their edits, and staged, invalid, and applied states remain accurate across selection/tab changes.
- **Reference:** [properties behavior retained](ui-cleanup-results.md).

### M8. Add reusable personal starters

**P3 · M · Proposal**

Extend built-in examples with “Save as starter” for recurring source, styles, and standard participants/tasks. First audit duplication and document-template capabilities.

- Store locally initially; make export/import explicit. Remove project-specific links and dates only through a previewed choice.
- **Done when:** creating from a starter makes independent content with valid identities and does not modify the original.

## Larger opportunities worth retaining

These are candidates for discovery, not claims that their foundations are absent. Reconcile them with [feature strategy](feature-strategy.md), [connected project diagrams](connected-project-diagrams-plan.md), and [delivery scenario lab](delivery-scenario-lab-plan.md) before implementation.

### L1. Spreadsheet-style Gantt task editing

**P2 · L · Proposal**

Add an editable table for names, dates/durations, progress, resources, and dependencies alongside the Gantt. Start with existing parsed fields and existing mutation operations; preserve unsupported source syntax.

- **Value:** editing ten task owners or progress values should not require ten separate inspector visits.
- **First slice:** editable name/progress/resource columns plus selection synchronization; bulk paste comes later.
- **Acceptance:** invalid cells cannot silently alter the plan; multi-row edits have a clear undo transaction; source and canvas agree after every committed operation.

### L2. Saved, comparable what-if scenarios

**P2 · L · Proposal extending existing Gantt analysis**

Add named scenario persistence and side-by-side comparison of finish dates, milestones, workload, and assumptions. Audit current persistence before specifying storage changes.

- **First slice:** save/reopen one alternative and compare it with the current plan.
- **Acceptance:** the base revision is visible, stale scenarios require reconciliation, and applying changes uses the existing review/undo path.

### L3. Guided connected-document workspace

**P2 · L–XL · Proposal extending existing linked diagrams**

Build a guided journey from WBS deliverables to Gantt tasks and relevant software diagrams. The current WBS menu already offers “Create Gantt chart from WBS”; this is a discoverability and workflow extension, not a request to rebuild conversion.

- **First slice:** a document overview showing diagrams, link health, and the next repair/review action.
- **Acceptance:** users can explain which objects are linked, preview synchronization effects, and repair stale links without creating duplicates.

### L4. Visual semantic review across history and proposed edits

**P3 · L–XL · Proposal extending existing history/review**

Build on existing version history and scenario review with human-readable object changes and visual highlights for supported diagram types.

- **First slice:** compare two versions of one Gantt or Sequence diagram with a linked source fallback.
- **Acceptance:** unsupported syntax is marked unclassified; renames are not falsely presented as unrelated deletion/addition; accepted change groups remain valid and undoable.

### L5. Presentation and review mode

**P3 · L · Proposal**

Offer a read-focused full-screen view with saved positions, step-through highlights, and navigation among related diagrams. Audit existing viewer/collaboration permissions first.

- **First slice:** local walkthroughs with named views; anchored comments and shared review links are later slices.
- **Acceptance:** editing controls disappear in presentation mode, navigation is keyboard-accessible, and any future share flow clearly states audience and permissions.

### L6. Task-aware mobile editing

**P3 · L · Proposal**

Responsive fixes alone will not make dense diagrams comfortable on phones. Consider a compact list/outline-first mode with a full-screen properties sheet and explicit “View on diagram”.

- **First slice:** Gantt progress/resource updates and WBS navigation; keep detailed source editing secondary.
- **Acceptance:** common review/check-in tasks work on a real touch device without precision dragging; safe areas and software keyboards never hide required actions.

## Delivery sequence

1. **Small corrective PR:** Q1–Q3 and Q12. Verify mobile dialog bounds, accessible close names, and destination/empty-state wording. These have the most concrete evidence and smallest scope.
2. **Navigation and identity PR:** Q4–Q6 and Q7. Preserve existing commands/save dispatch and test new versus saved document states.
3. **Reporting PR:** Q8 followed by M4. Exercise no people, no matching dates, excluded tasks, unassigned work, and a populated report.
4. **Editing clarity PR:** Q9–Q11, Q13–Q14. Keep existing mutation and draft guards; validate common and advanced edits.
5. **Onboarding/features:** M1–M3, then choose M5–M8 using user feedback. Avoid combining onboarding, export, and persistence changes in one release.
6. **Larger-feature discovery:** prototype L1 and L2 first for planning-heavy users; prioritize L3/L4 instead if connected engineering review is the main audience. Do not start all six large tracks together.

No app-shell rewrite is a prerequisite. Extract reusable presentation only where the chosen change needs it. Before changing shared symbols, trace callers and account for diagram-family siblings; refresh Graft after substantial code changes.

## Validation and decision gates

- Capture relevant before/after states at 1440, 1024, and 390 pixels, plus 320-pixel and browser-zoom checks for changed dialogs. Check light and dark appearance. Use real touch/software-keyboard testing for mobile claims.
- Exercise keyboard-only opening, selection, closing, and focus return for changed menus/dialogs. Verify accessible names and meaningful state announcements.
- For property changes, cover valid commits, invalid drafts, staged edits, undo/redo, switching selection, and closing. Confirm generated source preserves unrelated content.
- For navigation-only changes, verify shared handlers and command parity; do not add implementation-mirroring tests for label edits.
- For report changes, assert exactly which tasks/recipients are included; do not rely only on screenshots.
- Run focused existing tests for each behavior change, then the repository's required checks for the implementation scope. No application test run was needed for this documentation-only review.
- Pilot with a few new and returning users: create a diagram, expose code, rename a task, find scenario analysis, produce an unassigned-work summary, and identify where work is saved. Record completion, wrong turns, and explanations of state. Establish a baseline before setting numerical improvement targets.

## Suggested first implementation slice

Implement Q1, Q2, Q3, and Q12 in a focused follow-up. They address reproduced layout/accessibility issues and verified copy mismatches without changing file formats, rendering, or source mutation semantics. Then tackle code discoverability and planning-tool navigation before investing in new major features.
