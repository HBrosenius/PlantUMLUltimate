# UI improvement plan — low-hanging fruit and next features

Date: 2026-10-09
Method: hands-on walkthrough of the dev build (`web-alt`, port 5185) at 1440×900 and 375×812 (phone width), dark theme. I covered the welcome dialog, the menus, the command palette, Help, Settings, Reports, the new-diagram chooser, the Gantt and Sequence editors (Code, Split and Diagram views), the Issues panel, Workload and Calendar. I then checked selected findings in the source.

Items marked **(verify)** showed up once during the walkthrough but were not reproduced reliably. Reproduce them before you fix them.

Effort: **XS** < 2 h · **S** ≤ 1 day · **M** 2–4 days · **L** 1–2 weeks.

---

## 1. Quick wins: bugs and visual defects (XS–S)

| # | Finding | Proposal | Where | Effort |
|---|---------|----------|-------|--------|
| 1.1 | **Calendar & schedule and Workload panels overlap.** If you open Workload and then Calendar, both render in the same right column, stacked on top of each other. Escape does not close Workload. | Make the right-hand side panels mutually exclusive (one `activeSidePanel` state), or turn them into tabs in one panel. Escape should close the top panel. | `App.tsx` (~5096, `ResourceWorkloadPanel` mount), `ResourceWorkloadPanel.tsx` | S |
| 1.2 | The **"Create task check-in…" button floats above the Workload panel header**. It is unstyled grey and sits outside the panel card. | Move the button into the panel body or footer and use the standard secondary button style. In the empty state ("Assign people to tasks…"), add an action that opens the task inspector or the Add task dialog. | `ResourceWorkloadPanel.tsx:190` | XS |
| 1.3 | **Keyboard chips overlap the text in Help.** For example, "Shift or ⌘/Ctrl + click" runs into the description column. | Give the shortcut column `min-width: max-content` or let it wrap, and align it as a grid. | `HelpDialog.tsx` + CSS | XS |
| 1.4 | **Category labels overlap command names in the command palette.** "Appearance" runs into "App theme: light". | Widen the category column or truncate it with an ellipsis. Alternatively, show categories as group headings instead of a per-row prefix. | `CommandPalette.tsx` + CSS | XS |
| 1.5 | **The Sequence toolbar status text collides with its neighbours.** "Message: Exchange code for tokens" and "Drag participants sideways · timeline elements vertically" render with no separator. In Split view with the inspector open, the preview toolbar wraps onto 3 rows. | Show the selection label as a chip and move the drag hint into a tooltip on the canvas. Let the toolbar overflow into a "⋯" menu below a width breakpoint. | `SequenceDiagramPreview` toolbar | S |
| 1.6 | **The "Open…" button in Create a diagram is unstyled** (grey browser-default look). | Apply the secondary button style and place it next to the title as "Open file…". | `NewDocumentDialog.tsx:57` area | XS |
| 1.7 | **The status bar shows a stale message.** "Created a new Sequence diagram from example…" stays visible after further edits and errors. | Clear transient status messages after about 5 s or on the next edit. | status bar in `App.tsx` | XS |
| 1.8 | **The Save button is always styled as primary** (outlined and highlighted), even when the header says "No unsaved changes". | Emphasise Save only when the document is dirty. Otherwise render it as a neutral button. | `App.tsx:3206` | XS |
| 1.9 | **The welcome text promises things the dialog cannot do.** It says "Create a diagram, open a file, or try an example", but it only offers theme and editing-mode settings. | Either add three large entry buttons (New / Open / Example) or change the copy to "Choose a few starting preferences". | `SettingsDialog.tsx:117` | XS |
| 1.10 | **The new-diagram dialog says "or try an example", but the examples sit below the fold.** The Component card is also cut off at 900 px height. | Add an "Examples" anchor or tab at the top, or show examples in a second column. Show the first example row without scrolling. | `NewDocumentDialog.tsx` | S |
| 1.11 | **(verify) The first click on a top-menu button sometimes does nothing** (seen on File and More after closing a dialog or switching view mode). | Check whether the menu's outside-click handler swallows the opening click while a dialog is closing. | `ActionMenu.tsx` / `FileMenu.tsx` | S |
| 1.12 | **(verify) The Sequence message inspector showed the wrong message after a source edit.** I edited line 7 above the selected message, and the inspector switched to the message on line 8. | Re-resolve the selection by stable element identity after each reparse, or close the inspector when the selection can no longer be resolved. | `SequenceMessageInspector.tsx`, selection mapping | S |
| 1.13 | **(verify) Reloading the page reopened the "Create a diagram" dialog** even though documents were already open. | Do not persist "new dialog open" across reloads. | workspace restore | XS |
| 1.14 | **Highlighted code line has poor contrast.** When a diagram element is selected, the matching source line goes grey on grey and the tokens are hard to read. | Use a translucent accent background and keep the token colours. | CodeMirror theme in `code-editor-setup.ts` | XS |
| 1.15 | **Many File and More submenu items expose no accessible name** (`menuitem` with an empty name for New, Open and Export). | Add `aria-label`s or move the visible text into the menuitem element. | `FileMenu.tsx` | XS |
| 1.16 | **View-mode buttons have a tooltip that shows only "Ctrl/Cmd+1".** | Use `title="Code view (Ctrl/Cmd+1)"`. | `App.tsx:3507` | XS |

## 2. Clarify and simplify (S–M)

### 2.1 Reorganise the top menu bar (M)
The current bar is **File · Save · Commands · Collaborate · More**. Some items are hard to find:
- **Gantt analysis…** and **Integrations: Jira…** are in *File*.
- **Reports…** is hidden under *More*, together with Settings and Help.
- The *Commands* button opens the palette, so it is a launcher, not a menu.

Proposal: **File · Edit · View · Plan (Gantt/WBS only) · Help**, with Save as an icon button next to the document name.
- *Plan*: Calendar & schedule, Workload, Reports, Gantt analysis, Delivery scenarios, Jira.
- *View*: Code/Split/Diagram, Outline, Issues, zoom, theme.
- *Help*: Help & shortcuts, What's new, About.
- Keep Collaborate as a right-aligned "Share" button, which is the convention in Figma and Docs.

### 2.2 Declutter the Gantt workspace toolbar (S)
The toolbar mixes actions (Add, Outline), panels (Calendar, Workload) and persistent settings ("Filter by resource: All", "When moving tasks: Always ask"), and it has a stray chevron (`⌄`) at the end.
- Move "When moving tasks" into Settings → Gantt. It is a preference, not a per-session control.
- Move "Filter by resource" next to the diagram (the preview toolbar) as a filter chip.
- Give the trailing chevron a label or remove it.

### 2.3 Unify the two Gantt toolbars (S)
The workspace toolbar and the preview toolbar (↑ ↓ Selected Today Fit − 100% + View Critical path Progress forecast) both act on the same canvas.
- Group the preview toolbar into navigation (↑ ↓ Selected Today), zoom (Fit − % + View) and overlays (Critical path, Progress forecast).
- Label "↑ / ↓" as "Previous / Next task" or use icons with tooltips.
- Collapse "View" (Day/Week/Month/Fit) into the zoom group.
- **Replace the "Timeline" range slider** at the bottom. It duplicates the native scrollbar. Either remove it or turn it into a real minimap that shows the bars.

### 2.4 Make selection and inspector behaviour consistent (S)
The hint says "select an item to edit its properties", but in Sequence a single click only selects. The inspector opens on **double-click**.
- Open the inspector on single-click selection, as Gantt does. Alternatively, change the hint to "Double-click an item to edit it".
- Make the hint dismissal permanent per diagram type. It is currently keyed by kind, so check that it stays dismissed after a reload.

### 2.5 Inspector forms: apply live, explain jargon (S)
- The Sequence inspector needs an explicit **Apply**. Other editors apply on change. Pick one model; live apply with undo is the norm here.
- "Anchor: Optional Teoz anchor" is jargon. Add a help tooltip ("Teoz-only: name this message so others can align to it") or hide it under "Advanced".
- Turn From/To into proper comboboxes (datalist works, but there is no visible affordance).

### 2.6 Issues panel: less noise, more fixes (S)
With one unclosed `group`, the panel shows **2 errors for the same line**, each followed by the same generic "How to resolve… No automatic correction is available" paragraph.
- Merge diagnostics that share a line and root cause.
- Show generic guidance once, collapsed, and show specific guidance inline.
- Add an obvious quick fix: **"Insert matching `end`"** for unclosed `group/alt/loop/opt/par/critical/box/partition`. The block-repair code already exists (`block-repair-safety.ts`, `diagram-terminator-repairs.ts`), so this is likely only wiring.
- Mark the preview as stale while the source has errors. The status bar says "Preview current" even though it shows the last *valid* render. Use "Showing last valid preview".

### 2.7 Reports dialog (S)
- The breadcrumb shows **"untitled.pumlu / untitled.pumlu"**. Show the diagram name instead, or omit the second part for single-diagram documents.
- The default report type, *Task check-in*, is empty when nobody is assigned. Default to a report that always has content (Delivery outlook), or make the empty state say "No one is assigned yet — try *Milestone and delivery outlook*" with a one-click switch.
- 8 report types is a lot, and three overlap: "Progress forecast", "Progress and due-date outlook" and "Milestone and delivery outlook". Group them in the select (`<optgroup>` *Status* / *Forecast* / *History*) and consider merging the overlapping ones.
- "Gantt analysis…" (File menu) overlaps with the Critical-path report. Fold one into the other.

### 2.8 Settings is thin (S)
It only covers theme, default diagram theme, editing mode and one Gantt checkbox. Add the obvious editor preferences:
- editor font size
- word wrap
- tab size
- line numbers
- default view for new tabs
- default zoom ("Fit" vs 100 %)
- "When moving tasks" (from 2.2)

Add a **diagram-theme preview thumbnail**. 44 theme names in a plain `<select>` give the user nothing to choose from.

### 2.9 Help dialog (S)
The left column is a wall of prose and the shortcut list is long and unsearchable.
- Add a filter box.
- Group shortcuts (General / Editing / Gantt / Sequence).
- Show only the shortcuts relevant to the current diagram kind first.
- Use one notation consistently: "⌥T" appears next to "⌘/Ctrl+N". Render per platform (⌘ on macOS, Ctrl elsewhere).

### 2.10 Command palette coverage (XS–S)
These commands are reachable from menus but missing from the palette, at least for Sequence:
- Reports
- Version history
- Document settings
- Gantt analysis
- Jira
- Fit diagram
- Close tab
- Next/previous tab
- Rename symbol
- Go to line

Add them, and show **recently used** commands at the top.

### 2.11 Documents vs tabs model (M, clarify first)
"New diagram tab → Example" opened a **separate `.puml` tab**. Meanwhile the default document is a multi-diagram `.pumlu`. A user cannot easily tell whether the new diagram belongs to the open project file.
- In the new-diagram dialog, ask: **"Add to `untitled.pumlu`"** vs **"New separate file"**, with the current document preselected.
- Show the containing document in the tab tooltip and in the header.

### 2.12 Default zoom for rendered diagrams (XS)
The Sequence example rendered at 100 % and overflowed the preview, and the Gantt sample sat in a small box at the top of a large empty canvas. Default to **Fit width** for new and opened diagrams, and remember the zoom per tab.

## 3. Responsive and mobile (S–M)

- **Split view stays on at 375 px.** Code and diagram each get about 180 px and both become unusable. Below about 768 px, force a single view with a Code/Diagram toggle. Optionally stack the panes vertically on tablets. (S)
- Dialogs on the phone (Create a diagram) sit flush left without a gutter, and the header is clipped behind them. Use a full-screen sheet below 600 px. (S)
- The app title disappears on the phone, which is fine, but the menu row and the document-name row then wrap awkwardly. Collapse the menus into one "☰" menu at phone width. (M)

## 4. Small features with high value (S–M)

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 4.1 | **Format / prettify source** (indent blocks, normalise arrows) | Common request for text-first diagram tools. The parsers already provide block structure. | M |
| 4.2 | **Copy share link / embed snippet** (`plantuml.com`-compatible encoded URL, Markdown image) | Export already has "Copy as Markdown" and "Copy for Confluence". A plain encoded URL is the cheapest share option and needs no server. | S |
| 4.3 | **Recent files** list in File → Open and in the new-diagram dialog | There is no "recent" anywhere. File-system handles can be stored in IndexedDB. | S |
| 4.4 | **Drag-and-drop a `.puml` or `.pumlu` file onto the window** to open it | Expected behaviour for a local-first editor. | S |
| 4.5 | **Paste PlantUML text to create a diagram** ("Import from clipboard" in the new-diagram dialog, with type auto-detected through `detectPlantUmlDiagramType`) | The most common way users arrive with existing diagrams. | S |
| 4.6 | **More Gantt Add-menu items**: Dependency…, Resource…, Note…, Closed day… (Add currently has only Task/Milestone/Divider) | These features exist but you have to find them in the inspector or the calendar. | S |
| 4.7 | **Minimap / outline jump** for long Sequence diagrams | The Sequence preview scrolls a lot, and Outline exists only as a dialog. | M |
| 4.8 | **Find in diagram** (Ctrl+F on the canvas highlights matching elements) | Large diagrams. Reuses outline search. | S |
| 4.9 | **Settings: "Open last workspace" vs "Start with chooser"** | Removes the surprise of reopened dialogs (see 1.13). | XS |
| 4.10 | **Workload empty state with sample assignment**: "Assign Alice to Backend" quick action | Workload and Task check-in look broken until resources exist. Teach the feature in place. | S |

## 5. Larger, obvious features (M–L)

These are not low-hanging fruit, but they came up repeatedly while using the app.

1. **Side-panel framework (M).** Calendar, Workload, inspectors, Issues and Outline all compete for the right column and squeeze the preview in Split view. A single docked, resizable, tabbed side panel would fix bug 1.1 and gap 2.4 together and make room for future panels. A collapse toggle and a remembered width are part of the same change.
2. **Inline diagram editing everywhere (L).** Gantt supports drag, resize and dependency creation. Sequence has partial support (reorder participants, drag messages). Use Case, Class, Component and Activity are mostly inspector-only. Prioritise: inline label rename (double-click on the canvas), drag-to-connect for relationships, and drag-to-reorder for activity steps.
3. **Theme-aware diagram rendering (M).** In the dark app theme, the default PlantUML render is a light diagram on a dark canvas. The Gantt weekend hatching and the `#AAF` "today" column look harsh. Offer an "Adapt diagram to app theme" toggle (preview only, exports unchanged) that uses a dark skinparam set.
4. **Onboarding tour or interactive tips (M).** The app has deep features that are hard to discover: linked WBS↔Gantt, Scenario Lab, semantic review, Jira, collaboration. The welcome dialog only covers preferences. Add a 4–5 step dismissible tour on the first Gantt and a "What's new" entry in Help.
5. **Templates gallery and "Save as template" (M).** The examples are good. Let users save their own document as a template (stored locally, or in the `.pumlu`) and start from it in the new-diagram dialog.
6. **Comment / review mode on the diagram (L).** Collaboration has presence and live edits but no comments. Anchored comments on elements, stored in `.pumlu`, would support reviews without Confluence round trips. This also fits the "semantic review" strategy in `docs/feature-strategy.md`.
7. **Split `App.tsx` (5 474 lines) and `DiagramPreview.tsx` (2 241 lines) along UI regions (L, enabler).** Many items above (menus, side panels, toolbars) touch these files. Extracting `MenuBar`, `WorkspaceToolbar`, `SidePanelHost` and `StatusBar` first would make the UI work cheaper and safer. This matches Phase 3 in `docs/next-steps.md`.

## 6. Suggested order

1. **Week 1, quick wins:** 1.1–1.10, 1.14–1.16, 2.12. Mostly XS, all user-visible.
2. **Week 1–2:** reproduce and fix the *(verify)* items 1.11–1.13; Issues panel improvements (2.6); command palette coverage (2.10).
3. **Week 2:** menu reorganisation (2.1) plus Gantt toolbar declutter (2.2, 2.3). Do these together, because they move the same controls.
4. **Week 3:** side-panel framework (5.1), which absorbs 1.1 and 2.4; mobile single-view (section 3).
5. **Then:** small features 4.2–4.5 (share link, recent files, drag-drop, paste-to-create), followed by the larger items in section 5 based on user feedback.

## Verification notes

- Every finding above was observed in the running dev build on 2026-10-09, except the items marked *(verify)*, which showed up once.
- The `Parse … ms · Overlay … ms` badge in the Gantt preview is **dev-only** (`import.meta.env.DEV` in `DiagramPreview.tsx:1797`), so it is not listed as a production issue.
- I did not exercise the following areas in depth: Jira, collaboration sessions, Delivery Scenario Lab, version history, WBS/Class/Use Case/Activity/Component editors, and light theme. A second pass over these is recommended.
