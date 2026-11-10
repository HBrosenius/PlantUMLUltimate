# PlantUML Ultimate — UI usability review

Date: 3 November 2026  
Scope: Local web app; usability, discoverability, visual clarity, and workflow consistency.

## Main recommendation

Simplify the path from **create → edit → save → export**. The app has substantial capability and several good safeguards, but users must interpret too many overlapping concepts: diagram versus document, view versus editing mode, preview zoom versus timeline scale, and property auto-save versus file saving. Improve these relationships before adding more controls.

The highest-value changes are a simpler creation dialog, a consistent inspector commit pattern, clearer save-state language, and a more compact workspace header.

## Review method and limits

This is a heuristic review based on direct interaction with the running local app, screenshots, and accessibility-tree inspection. It is not a user study or an accessibility compliance audit.

Inspected:

- Sequence workspace and its navigation/zoom controls.
- File menu, New → Diagram, creation chooser, and creation of a Gantt starter.
- Gantt canvas, planning menu, calendar inspector, and task inspector.
- Code/Diagram/Split navigation, source editor, and empty Issues panel.
- Application Settings and export preview.
- The initial narrow browser viewport (approximately 614 × 724) and a 1440 × 900 desktop viewport.

Not exercised end to end: file writes, restore, collaboration, Jira, large projects, invalid-source recovery, all diagram types, mobile touch gestures, light appearance, screen-reader operation, or keyboard-only completion. Recommendations in those areas are explicitly validation tasks rather than confirmed defects.

The local-development banner and performance metrics are development-specific; they are excluded from production clutter findings. No app source was changed. A temporary Gantt starter was created in the review browser's workspace.

## What already works well

- Code, Split, and Diagram are visible workspace choices, with shortcuts exposed in help text.
- Diagram templates have visual previews and plain-language descriptions of their purpose.
- Save has a clear primary visual treatment.
- File saving and browser recovery are explicitly distinguished; preserve that distinction.
- Inspectors group task properties into meaningful sections, with Appearance and Resources initially collapsed.
- Gantt provides Fit, Today, selected-task navigation, and a non-drag task view.
- Export preview explains what is exported and excludes editing overlays.
- The Issues panel has a clear successful empty state.

## Prioritized improvements

Priority definitions: **P1** = address next because it affects a central workflow; **P2** = valuable simplification; **P3** = polish or a hypothesis to validate. Effort estimates are relative design/implementation scope, not delivery commitments.

| ID  | Priority | Improvement                                      | Estimated scope |
| --- | -------- | ------------------------------------------------ | --------------- |
| 1   | P1       | Simplify diagram creation                        | Medium          |
| 2   | P1       | Make property commit behavior predictable        | Medium          |
| 3   | P1       | Clarify document identity and saving             | Medium          |
| 4   | P1       | Reduce header layers and reveal frequent actions | Medium          |
| 5   | P1       | Adapt inspectors to narrow windows               | Medium          |
| 6   | P2       | Consolidate overlapping settings                 | Medium          |
| 7   | P2       | Clarify zoom versus timeline scale               | Small           |
| 8   | P2       | Improve initial canvas composition               | Small–medium    |
| 9   | P2       | Make visual editing easier to discover           | Medium          |
| 10  | P2       | Unify the export entry point                     | Small–medium    |
| 11  | P2       | Give status information a clearer hierarchy      | Small           |
| 12  | P2       | Validate and improve accessibility semantics     | Medium          |
| 13  | P3       | Establish a consistent visual and copy system    | Medium          |

### 1. Simplify diagram creation

**Observed:** The creation dialog offers Open… and Recent files & import… at the top, followed by another Create / Open / Try an example row. It then shows a preferences explanation, starter selection, naming, diagram types, personal starters, and a tour. In the narrow viewport, the diagram cards start near the bottom of the visible dialog. Clicking Gantt immediately created the diagram and opened its calendar inspector.

**Why it matters:** The user has to scan unrelated options before reaching the main decision. A card can look like a selection even when clicking it immediately commits creation.

**Recommendation:** Use one navigation row: **Create / Open / Examples**. In Create, put diagram types first, with name and Blank/Starter choices beneath the selected type. Use one explicit **Create diagram** button. Move preferences and the tour out of this task. Retain recent/import options within Open. Offer calendar setup after creation as an optional next step rather than automatically covering the canvas.

**Acceptance:** At both tested widths, a user can identify the diagram choices and primary action without scrolling past introductory content. Each opening path appears once. Selecting a type does not unexpectedly create a tab.

### 2. Make property commit behavior predictable

**Observed:** The task inspector says “Auto-save properties” and applies text on leaving a field. Calendar & schedule says “Apply / Cancel properties,” initially shows “Applied,” and provides an Apply button. These related panels use different commit models.

**Why it matters:** Users must remember which edits are already effective and which are drafts. “Auto-save” also risks being confused with saving the file.

**Recommendation:** Use immediate, undoable updates for ordinary object properties, with concise feedback such as **Updated diagram · Undo**. Retain staged changes for consequential schedule operations, but show **Unapplied changes** and persistent **Apply changes / Discard** actions. Describe the distinction at the point of action. Avoid “auto-save” for source mutations that do not write the file.

**Acceptance:** Every inspector clearly communicates draft versus applied state; leaving a staged panel has an explicit outcome. An ordinary property edit can be undone without manually restoring the old value. Validate existing close guards before changing them; this review did not establish data loss.

### 3. Clarify document identity and saving

**Observed:** The initial sequence header reads “untitled.pumlu — untitled.pumlu.” A new Gantt shows “Gantt diagram — New separate file” and “Not saved to a file.” Tabs carry diagram names, while File → New distinguishes Diagram from Document. Browser recovery appears separately in the footer.

**Why it matters:** Users need to know what Save writes, whether a diagram belongs to a larger document, and whether recovery is a durable file copy.

**Recommendation:** Give the active diagram one clear name and a secondary container/file label only when different. Explain New Document as **Document — contains multiple diagrams**, and New Diagram as **Diagram — add to this document or create a separate file** where applicable. Keep a compact save status beside Save: **Not saved to a file**, **Changes not saved**, or **Saved to [filename]**. Explain browser recovery in its existing disclosure rather than duplicating the full warning across the UI.

**Acceptance:** Users can answer “What will Save save?” and “Where is my work stored?” without opening Help. Repeated identical names disappear. A diagram inside a multi-diagram document clearly identifies its parent.

### 4. Reduce header layers and reveal frequent actions

**Observed:** In the narrow workspace, menus, utilities, document identity, the ribbon group row, tabs, view modes, and canvas controls occupy roughly the top third of the window before the diagram begins. In compact mode, Plan requires opening Planning tools before choosing Calendar & schedule or Workload.

**Why it matters:** Multiple horizontal bands reduce work area and make the UI look more complicated than the current task requires.

**Recommendation:** Organize the header into a compact app/action row and a document/view row. Keep the ribbon collapsible, but expose the most frequent context-specific action directly: for example **Add task** and **Calendar** for Gantt, **Add participant** for Sequence. Put secondary planning features in a clearly named overflow. Preserve command-palette access for experienced users.

**Acceptance:** The narrow layout has fewer stacked control bands; a user can add the diagram's primary object without opening a generic group first. The active view remains visible at every width. Do not remove labels merely to save space.

### 5. Adapt inspectors to narrow windows

**Observed:** At approximately 614 px wide, Calendar & schedule overlays most of the diagram. Its translucent surface allows the chart to show through the form, competing with field labels. The panel is long and requires scrolling.

**Why it matters:** The user loses visual context while editing, and the underlying chart reduces readability.

**Recommendation:** Use an opaque inspector surface. On wide screens, dock it beside the canvas; on narrow screens, use a deliberate full-height sheet with a clear Back/Close control and sticky actions. Group calendar fields into **Working days**, **Timeline**, and **Diagram text**. Keep advanced display options collapsed.

**Acceptance:** Form text never competes with the diagram behind it. The active object or calendar scope remains explicit. Close and commit controls stay reachable without scrolling through the form. Verify return focus and preservation of drafts.

### 6. Consolidate overlapping settings

**Observed:** Settings is a long scrolling dialog. Theme previews appear before editing preferences. “Editing mode” offers Diagram only / Diagram + code, while “New diagram tabs” separately offers Default view → Use current view / Code / Split / Diagram. Explanatory text describes overlapping startup behavior.

**Why it matters:** Users cannot easily predict which preference wins, and common controls are buried beneath a large appearance section.

**Recommendation:** Add categories: **Appearance**, **Editor & navigation**, **New diagrams**, and **Gantt**. Consolidate startup/default view into one setting with a clearly stated scope. Keep app appearance separate from diagram styling. Provide a direct **Change this diagram's theme** link where the default-theme explanation already points users toward Document settings. Search is optional until settings volume justifies it.

**Acceptance:** There is one authoritative default-view control. Every setting makes its scope clear: this browser, new diagrams, or this document. Common editor settings are reachable without scrolling through theme thumbnails.

### 7. Clarify zoom versus timeline scale

**Observed:** The app correctly distinguishes Preview zoom from Timeline scale, but explains this repeatedly in gesture tips, calendar fields, and supporting text. The calendar also uses “Timeline scale factor” and “Scale zoom,” while the canvas zoom percentage is a reset button.

**Why it matters:** Similar terms require long explanations and can make harmless navigation feel risky.

**Recommendation:** Use **Canvas zoom** consistently for magnification and **Time axis** for day/week/month granularity. Rename the advanced numeric factor to **Time-axis spacing**, with a short example. Label the reset tooltip **Reset canvas zoom to 100%**. Put the source-changing explanation beside the time-axis control once.

**Acceptance:** Users can change view magnification without wondering whether it changes the saved diagram. Day/week/month choices and percentage zoom are visually and linguistically distinct.

### 8. Improve initial canvas composition

**Observed:** The initial Sequence preview appears small at the upper left at 72% in the narrow viewport. The Gantt starter remains upper-left aligned with substantial unused canvas at desktop size. Fit controls already exist.

**Recommendation:** Center small diagrams in the available canvas and select an initial scale that preserves readable labels without excessive enlargement. Keep a maximum initial scale. Preserve deliberate pan/zoom choices after edits. Offer an obvious **Fit diagram** action and verify how fitting responds when an inspector opens.

**Acceptance:** Starter diagrams are immediately readable at both tested sizes. Opening an inspector does not hide the selected object or reset a manually chosen view. Large diagrams retain predictable navigation.

### 9. Make visual editing easier to discover

**Observed:** Sequence exposes reorder controls and draggable participants/messages; Gantt exposes selectable tasks and dependency anchors. The Gantt tip focuses on panning, zooming, and source effects rather than the first editing action.

**Recommendation:** Show a short, dismissible contextual hint such as **Select a task to edit it. Drag its edge to change duration.** Reveal drag handles on hover, selection, and keyboard focus. Provide equivalent menu or inspector actions for every drag operation. Introduce advanced dependency gestures only when relevant.

**Acceptance:** A first-time user can discover selection, property editing, and object creation without reading a general tour. Essential actions have a non-drag alternative. Existing help remains available after tips are dismissed.

### 10. Unify the export entry point

**Observed:** File → Export contains Preview export…, direct SVG/PNG/PDF actions, Source, image copying, Markdown, Confluence, and Link and embed. Export preview already provides format, margin, background, dimensions, and Download. Raster scale is visible but disabled for SVG.

**Recommendation:** Make **Export…** open the preview as the primary path. Keep fast exports in a secondary “Quick export” group or remember the last format. Separate **Download**, **Copy**, and **Share/embed** concepts. Use **Image resolution** instead of Raster scale, and show it only for applicable formats. Explain vector versus raster briefly in format help.

**Acceptance:** Users have one obvious path to a predictable downloadable result. Format-specific options appear only when relevant. Fast repeat export remains available. Preserve the existing warning that exports use the last successfully rendered source; test stale-preview behavior separately.

### 11. Give status information a clearer hierarchy

**Observed:** The footer simultaneously shows validity, Issues, diagram type, preview currency, recovery, and—in Split—cursor position. These represent different kinds of state. The Issues button remains useful when there are zero issues.

**Recommendation:** Group document health into **No issues** or **2 issues**, opening the existing panel. Keep render state separate, with a stronger signal only for rendering, failure, or a stale preview. Keep file persistence beside Save and recovery details in a quiet disclosure. Put cursor position nearest the source editor.

**Acceptance:** At a glance, the user can distinguish invalid source, an outdated preview, and unsaved file changes. Healthy states remain quiet; failures include the next action. Do not rely on color alone.

### 12. Validate and improve accessibility semantics

**Observed:** In the inspected accessibility tree, Code/Split/Diagram and featured theme choices are exposed as checkboxes despite behaving as exclusive choices. Document tabs appear as buttons with nested Close controls. This is a semantic concern, not proof of a screen-reader failure.

**Recommendation:** Audit the actual roles and keyboard model. Use tabs or a radio group for exclusive view choices; use a radio group for a single selected theme. Ensure document selection and closing have separate, unambiguous focus targets. Verify keyboard alternatives for task moves, dependency creation, and sequence reordering. Measure text contrast and pointer targets rather than judging compliance from screenshots.

**Acceptance:** Complete create → edit → inspect → save/export using keyboard alone. Selection state is announced accurately. Escape closes only the intended layer and returns focus sensibly. Test zoomed text, narrow layouts, and at least one screen reader. Record measured contrast and target-size results before claiming compliance.

### 13. Establish a consistent visual and copy system

**Observed:** Some segmented choices use browser-like gray button treatments while primary actions and other controls use custom dark surfaces. Dense explanatory text competes with field labels. Terms include “footbox,” “move policy,” “authored background,” and “preserved lines.”

**Recommendation:** Standardize button hierarchy, spacing, control heights, focus rings, muted text, and panel surfaces. Keep technical names when useful, paired with short plain-language descriptions: **Participant footer (footbox)**, **When moving tasks**, **Keep diagram background**. Use sentence case consistently. Reserve explanatory paragraphs for decisions with real consequences; move secondary detail into help disclosures.

**Acceptance:** Equivalent controls look and behave consistently across dialogs and inspectors. Every technical term needed for a common task has an understandable label or nearby explanation. Shortening copy must retain warnings about source changes and persistence.

## Suggested target workflow

1. **Start:** Create, Open, or Recent. Creation asks for type, then optional name and starter content.
2. **Edit:** Diagram is immediately visible with a relevant Add action. Code/Split remain one click away.
3. **Select:** The object inspector opens with essential properties first. Editing feedback distinguishes diagram updates from file saving.
4. **Save:** One clear action identifies the file/document being saved; recovery remains a separate safety net.
5. **Export:** A preview shows the actual output, with only options relevant to the selected format.

Keep advanced capabilities available through contextual actions, the command palette, and well-labeled secondary menus.

## Implementation sequence

### Pass 1 — clarity and consistency

Address duplicated creation actions, repeated names, commit-state wording, zoom terminology, and export labels. Preserve existing safeguards and keyboard shortcuts. Validate all affected UI text at narrow widths.

### Pass 2 — layout and information architecture

Restructure creation, settings, header layers, and responsive inspectors. Prototype with Sequence and Gantt first because they expose different interaction needs. Check other supported diagram types before generalizing their toolbars.

### Pass 3 — interaction and accessibility

Validate canvas fitting, contextual onboarding, keyboard alternatives, roles, focus handling, contrast, and larger-document behavior. Make changes from observed failures rather than assuming all advanced workflows share the same issue.

## Validation plan

Run a small formative usability study with both people unfamiliar with PlantUML and experienced users. Ask participants to:

1. Create a named Sequence diagram from a starter and add a participant.
2. Create a Gantt diagram, change a task duration, and change working days.
3. Explain which edits are applied and whether the file is saved.
4. Switch to source editing and return to the selected object.
5. Export a PNG with a white background.
6. Find the default view preference and explain whether it affects the current tab.

Measure unassisted task completion, wrong turns, time to first successful edit, and correctness of save-state explanations. Compare before and after; no baseline metrics were collected in this review. Repeat critical tasks at narrow width and with keyboard-only navigation. Test invalid source and recovery separately with disposable fixtures.

## Code navigation leads

These are graph-derived implementation starting points, not a completed source-level defect diagnosis. Verify current spans before editing.

| Area                                 | Graph location                              |
| ------------------------------------ | ------------------------------------------- |
| Creation dialog                      | `apps/web/src/NewDocumentDialog.tsx:34–271` |
| Settings dialog                      | `apps/web/src/SettingsDialog.tsx:74–374`    |
| Ribbon and workspace navigation      | `apps/web/src/Ribbon.tsx:8–191`             |
| Task properties                      | `apps/web/src/TaskInspector.tsx:42–600`     |
| Calendar/project properties          | `apps/web/src/ProjectInspector.tsx:6–361`   |
| Inspector lifecycle and draft guards | `apps/web/src/InspectorPanel.tsx:17–314`    |

The original review proposed improvements. The implementation pass below records subsequent application changes and their validation.

## Implementation pass — 3 November 2026

Implemented against the current source, preserving source editing, file/recovery/download distinctions, history, and inspector leave guards. The original observations above remain as the review baseline.

| ID  | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                           | Remaining validation or scope                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One Create / Open / Examples route row; types precede options; type cards select without creating; sticky **Create diagram** action. Open/recent/import occur once in Open. Removed preferences/tour copy from creation; personal starters remain under Examples. New Gantt diagrams leave the canvas uncovered; Calendar is directly available.                                                                      | At phone widths the optional name/destination fields can require scrolling after the type choices. Examples and personal starters now select content and require the same explicit Create diagram action; personal content retains its review step.                                                                                                                                                        |
| 2   | Shared inspector status distinguishes **Unapplied changes**, invalid fields, and diagram updates; ordinary changes explain blur-to-commit and Undo availability, explicitly separate from Save. Calendar has persistent **Apply changes** and **Cancel**; Cancel/Close/Escape retain existing discard confirmation. Existing staged inspectors remain staged to preserve their validation and transaction boundaries. | No wholesale conversion of validated staged forms to immediate updates. Ordinary applied properties now expose inline Undo through the active document history, respecting read-only state and draft validity. Staged panels keep Apply/Discard semantics.                                                                                                                                                 |
| 3   | Suppressed identical diagram/file names; retained parent-document identity. Save status includes the saved filename and distinguishes never-saved diagrams even after edits. New Diagram/Document menu tooltips explain scope; recovery and download provenance remain distinct.                                                                                                                                      | Native file-picker behavior across platforms and real disk persistence were not audited; automated save tests use a controlled file handle.                                                                                                                                                                                                                                                                |
| 4   | Frequent **Add task / Calendar** or **Add participant** actions are beside the view controls. Narrow windows start with the ribbon collapsed; categories and command access remain available.                                                                                                                                                                                                                         | The larger header architecture is retained to preserve command discovery. Desktop identity shares the action row when space permits. A full two-row redesign remains a design follow-up, not a verified requirement.                                                                                                                                                                                       |
| 5   | Opaque narrow full-width inspector sheets; existing wide docking retained. Sticky header/commit actions and focus/leave guards remain. Calendar groups Timeline, Working days, Diagram text; advanced display options collapse.                                                                                                                                                                                       | Chromium checks at 614×724 and 1440×900 and screenshot inspection completed. Touch/mobile assistive technology still requires human validation.                                                                                                                                                                                                                                                            |
| 6   | Settings categories: Appearance, Editor & navigation, New diagrams, Gantt. Opens on editor preferences; new-tab Default view is the sole settings control for default view. Onboarding retains its initial-workspace choice. Existing tabs keep their view. Direct Gantt-preference entry opens Gantt; a button opens the current diagram’s theme settings.                                                           | No settings search added. Onboarding and recovered-workspace behavior remain separate scopes.                                                                                                                                                                                                                                                                                                              |
| 7   | **Canvas zoom**, **Time axis**, **Time-axis spacing**; reset tooltips say **Reset canvas zoom to 100%** across diagram types. Time-axis source effects remain explained beside its control.                                                                                                                                                                                                                           | The tracked training index and chapter metadata use current terms and explain the mapping to older recorded wording; existing audio/captions remain truthful to the recordings.                                                                                                                                                                                                                            |
| 8   | Centered compact diagrams horizontally and vertically using scaled geometry and available canvas dimensions; tall content keeps a zero vertical inset. Existing 1.5× initial enlargement cap, fit behavior, saved scroll, and manual navigation protections retained.                                                                                                                                                 | Readability/user preference and large-document composition need formative testing.                                                                                                                                                                                                                                                                                                                         |
| 9   | Contextual editing help now starts with object selection/property editing; Gantt explains edge resizing and inspector alternative. Existing dismiss/reopen behavior and non-drag controls retained.                                                                                                                                                                                                                   | Comprehensive keyboard alternatives for every diagram gesture were not audited; existing handles were not redesigned without an observed failure.                                                                                                                                                                                                                                                          |
| 10  | **Export…** is the primary preview action, with explicitly named **Quick download SVG/PNG/PDF** alternatives; Copy and Link/embed remain labeled separately. **Image resolution** appears only for PNG/PDF, with format help.                                                                                                                                                                                         | Export stays inside File → Export to preserve the established menu. All six Chromium export regressions passed, including stale/failed render gating, format downloads, retries, and source preservation.                                                                                                                                                                                                  |
| 11  | One quiet **No issues / N issues** button opens health details. Removed redundant healthy “Valid” status; render and recovery disclosures remain separate. File state remains beside document identity.                                                                                                                                                                                                               | Source cursor position now leads the footer in code/split views; empty healthy status messages disappear. Complete footer redesign remains deferred; no measured user confusion after these changes is claimed.                                                                                                                                                                                            |
| 12  | Featured themes are radios with roving focus and arrow/Home/End navigation. Document selection and Close are separate native buttons; updated focus lookup and automation selectors. Inspection confirmed view choices are native toggle buttons with explicit pressed state, rather than literal checkbox inputs.                                                                                                    | View controls retain their existing toggle-button keyboard model pending screen-reader testing of the additional Tasks/mobile modes. No accessibility compliance claim: screen reader, full keyboard-only workflow, zoomed text, and comprehensive contrast/target auditing remain outstanding. Focus-return/menu semantics and selected syntax contrast in light/dark are covered by browser regressions. |
| 13  | Plain-language footer/footbox labels, consistent commit/zoom/export language, opaque panels, selected-state styling, and sticky settings categories.                                                                                                                                                                                                                                                                  | Narrow/coarse-pointer history, tab-close and status controls have larger targets. A comprehensive design-token/control-system rewrite and whole-app contrast audit remain outside this pass.                                                                                                                                                                                                               |

### Verification

- Full unit suite: **251 files, 2,539 tests passed**.
- Chromium creation/settings/identity/responsive workflows: **9 tests passed** (including blank creation for all seven diagram kinds).
- Chromium export regressions: **6 tests passed**.
- Additional Chromium checks: **3 save-state tests**, **2 Gantt control tests**, and **3 source/view/zoom tests passed**. Save tests include successful controlled file writes, recovery, download provenance, cancellation, failure, and retry affordances.
- Responsive create/inspect/settings workflow: **4 additional tests passed in Firefox and WebKit**, at both reviewed sizes.
- Production web build (including TypeScript), targeted ESLint, and `git diff --check` passed.
- Screenshots inspected at 614×724 and 1440×900. These checks exercise light system appearance; no new dark-theme contrast measurement was performed.
- Existing automated tests/benchmarks were adapted to explicit creation, separate tab-close targets, settings categories, and renamed controls. The complete multi-browser E2E suite has not been run.

Human follow-up remains the formative study described above, screen-reader and keyboard-only end-to-end testing, comprehensive contrast/target measurements, touch gestures, real native file persistence, and connected collaboration/Jira workflows. None is represented as completed by this implementation pass.

### Follow-up implementation — 3 November 2026

- Examples and personal starters share explicit final creation. Personal starter review selects the reviewed source without creating a tab; Create diagram applies the selection and destination.
- Shared ordinary-property Undo uses active document history and is disabled for unapplied/invalid drafts or read-only history. A regression found during implementation fixed a delayed blur callback that could otherwise label newly typed text as applied.
- Compact diagrams receive nonnegative vertical centering; scaled-down layout height is compensated to avoid phantom scroll space. Tall content retains a top origin and scroll extent. Existing history/navigation tests remain the regression gate for deliberate view choices.
- Desktop identity can share the action row. Footer cursor position is nearer the source side; empty healthy messages disappear. Small-screen history, tab-close and status controls receive larger targets.
- Training landing text and chapter metadata explain Canvas zoom / Time axis and explicit creation; older video captions and recordings were not rewritten to claim a new recording.
- Full unit suite after these changes: **251 files, 2,540 tests passed**. Production build, TypeScript, targeted ESLint and `git diff --check` passed.

- Follow-up Chromium creation/personal-starter/responsive/canvas suite: **8 tests passed**. Checks include explicit creation, source review, cancellation/storage failure, embedded-document theme preservation, compact centering, tall scrolling and preservation of manual zoom.
- Existing Chromium navigation recovery suite: **7 tests passed**, one per supported diagram kind, covering both scroll axes, zoom, undo/redo, tabs/reload, inspector transitions and Fit. A missed explicit-creation step in that test was corrected after its failure screenshot showed the chooser still open; no renderer defect was inferred from that stale-preview wait.
- Accessibility regression subset: **8 Chromium tests passed**, including contextual close/focus return, menu naming/view tooltips and selected syntax contrast in light/dark appearances. This is specific regression evidence, not a whole-app contrast or screen-reader audit.
- Key Close, Calendar and Issues controls were measured at both reviewed widths: at least **24×24 CSS px**. The measurement exposed a 17 px desktop close target, now corrected; narrow/coarse-pointer versions use 32 px minimums. This does not measure every application target.

- Final responsive/example/canvas checks: **12 tests passed across Chromium, Firefox and WebKit** (four per browser). Both reviewed widths were covered. Chromium inspector screenshots were inspected after the final run.

- Additional default-window check: **1 Chromium test passed at 1280 px**; chooser screenshot inspected. Card minimum width was increased after the earlier failure screenshot exposed fragmented words in narrow text columns.

### Wheel-zoom regression correction

User testing found choppy, unpredictable wheel zoom after the centering changes. Zoom-dependent margins moved the layout origin at animation commit while cursor anchoring assumed a fixed origin. Automatic horizontal/vertical centering has been removed to restore stable navigation. Earlier centering verification above is historical and superseded by this correction. Any future centering design must preserve the cursor anchor throughout animation and commit.

### Tab-row simplification after user feedback

Removed the duplicate Add task / Add participant and Calendar quick-action group beside document tabs. This row is reserved for document and view navigation; insertion stays in Insert, and Calendar & schedule stays in Plan. The earlier recommendation for direct actions beside views is superseded by this feedback.
