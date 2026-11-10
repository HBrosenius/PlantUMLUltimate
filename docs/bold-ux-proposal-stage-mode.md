# Bold UX proposal: Stage — the diagram becomes the app

Date: 2026-11-06. Branch inspected: `fix/browser-workflows-after-usability-update` (`a67e262b`).
Status: proposal. Nothing here is implemented.

## What I saw

I ran the app locally (`web-alt`, 1440×900, dark theme) and opened the Gantt example.

- **The diagram is the smallest thing on screen.** A roughly 490×225 px white card sits in the top-left corner of a dark preview pane. It is the brightest object on the screen and it looks like a pasted screenshot, not like something you can work on.
- **Chrome comes before content.** Above the diagram are a dev banner, the menu/ribbon tab row, the ribbon commands, the ribbon caption, the document tab row, the preview toolbar (Navigate ↑ ↓ Selected Today · Canvas zoom Fit − 150% + · Diagram options) and a permanent hint paragraph. Below it are a perf badge, a Timeline slider and the status bar. The [3 Nov usability review](archive/ux-review-2026-11-03.md) counted seven rows before content.
- **The layout says "code editor with a preview".** The source takes half the width at all times. But the features that make this app special are on the canvas: dragging tasks, drawing dependencies, inspectors, workload, forecasts, linked WBS ↔ Gantt. The layout hides the product's best side.

The 3 Nov review lists about 30 good, incremental fixes (fit by default, remove duplicates, collapse hints). This proposal does not repeat them. It makes **one structural change** that solves many of them at once.

## The change: Stage mode

**Make the diagram a full-bleed, theme-native canvas, and turn the source code from a permanent half-screen pane into a "Source Lens" that follows your selection.**

The PlantUML text stays the single source of truth. Only the presentation changes: today the text is the stage and the diagram is the audience. Stage mode flips that.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ Gantt diagram ▾   Roadmap · Plan Q1 ▾          ⌘K Ask or do…    ●● Save │  ← one 44 px bar
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│     Oct        November 2026                          ┌───────────────┐  │
│     ░░░░ Architecture ▓▓▓▓                            │ SOURCE LENS   │  │
│              ░░ Backend ▓▓▓▓▓▓▓▓▓▓──┐                 │ 11 [Backend]  │  │
│              ░░ Frontend ▓▓▓▓▓▓▓▓▓▓▓▓▓│                │ 12 starts …   │  │
│                        ┌─────────────┴─┐              │ 13 lasts 8 d  │  │
│                        │ ⟷ 8d  ⇢ link  │  ← selection │               │  │
│                        │ ◷ 3 Nov  ⋯    │    dock      │ ⌘E full code  │  │
│                        └───────────────┘              └───────────────┘  │
│                              Testing ▓▓▓▓▓                               │
│                                                                          │
│  ◂ Today ▸                                     − 100% + ⤢   ▢ minimap    │  ← floating, fades when idle
└──────────────────────────────────────────────────────────────────────────┘
```

### The four parts

**1. A theme-native, full-bleed canvas.**
The diagram fills the window on an infinite, panned surface with a subtle dot grid. It opens fitted and centred. In dark mode the diagram itself is dark: white backgrounds become the canvas surface, black strokes and text become the foreground token, and accent colours keep their hue. This is a **preview-only** recolouring of the rendered SVG with CSS custom properties, so the source, exports and any `!theme` the author chose stay untouched. A toggle in the view menu shows the "true" render for checking exports.

_Why it matters:_ the single biggest visual problem is the glaring white card. A diagram that looks like it belongs to the app feels like something you can touch.

**2. A selection dock instead of the ribbon.**
When you select a task, message, class or node, a small floating toolbar appears next to it with the 4–6 actions that matter for that object type: duration, link/dependency, assign resource, colour, note, and ⋯ for the full inspector. With nothing selected, it offers "+ Add" for the diagram type (Task, Milestone, Participant…). The ribbon goes away. The top bar keeps only the document switcher, the command palette (now the primary "Ask or do…" entry point) and Save.

_Why it matters:_ commands appear where your eyes and pointer already are. This solves the duplicate-command problem (review items 2.2, 2.3, 4.1) by design instead of by cleanup: there is one place for each action, and it is next to the object.

**3. The Source Lens.**
The code moves into a translucent panel on the right. It is collapsed to a narrow strip by default and opens to show **only the lines of the selected element** (the app already maps selections to source ranges, as the existing selection-to-line highlight shows). Edits in the lens apply live, as they do in the full editor. `⌘E` expands it to the full CodeMirror editor, and Split view stays available as a saved layout for people who live in text.

_Why it matters:_ the source stays one keystroke away and becomes **more** visible where it matters. Seeing the three lines that define "Backend" is clearer than scrolling 200 lines to find them. It also teaches PlantUML: you see the text change as you drag.

**4. Calm, floating view controls.**
Zoom, fit, Today/Prev/Next and a minimap sit in a small floating cluster in the bottom corner. They fade when the pointer has been still for a few seconds. The permanent hint text, the Timeline slider and the dev perf badge leave the default layout. Hints become a one-time coach mark, and the perf badge moves to a debug setting.

## Why this is the right bold move

| Problem today (3 Nov review)                                   | How Stage mode solves it                             |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| 3.1 Diagram opens tiny in a large empty pane                   | Full-bleed canvas, fitted by default                 |
| 3.7 White diagram card in a dark UI                            | Theme-native recolouring                             |
| 2.1 Seven rows of chrome before content                        | One 44 px bar plus floating controls                 |
| 2.2 / 2.3 / 4.1 Commands duplicated across ribbon, bars, menus | One selection dock per object type, plus the palette |
| 3.3 / 3.4 / 3.8 Permanent hints, crowded toolbar, bare slider  | Floating cluster, coach mark, minimap                |
| 6.2 Ribbon eats a third of a phone screen                      | Same design on mobile: dock becomes a bottom sheet   |

It also positions the product. The [feature strategy](feature-strategy.md) notes that "text + canvas" is now expected (Mermaid Chart, Eraser). Stage mode makes this app feel like a modern canvas tool such as Figma or tldraw, **while keeping the source of truth in plain PlantUML**. No competitor in that table offers both.

## How to build it (incremental, behind a setting)

Ship it as a new layout, `ViewMode = "stage"`, next to `code | split | diagram` (`apps/web/src/model.ts:1`). Make it the default only after it has proven itself.

| Phase | Scope                                                                                                                                                                                | Main code                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1     | **Theme-native canvas.** Recolour the inline SVG with CSS variables (map near-white fills and near-black strokes or text to tokens). Add a dot-grid surface, fit on open and resize. | `DiagramPreview.tsx` render host; shell tokens from `shell-theme.ts`              |
| 2     | **Stage layout.** Add the new view mode with a single top bar and the floating view cluster. Keep the ribbon reachable from ⌘K during the transition.                                | `use-responsive-view-mode.ts`, `use-workspace-layout.ts`, `App.tsx` shell         |
| 3     | **Source Lens.** A CodeMirror instance limited to the selected range, with "expand to full editor".                                                                                  | `CodeEditor.tsx` (reuse it, do not fork it); the existing selection→range mapping |
| 4     | **Selection dock.** Per-family action sets that reuse existing feature actions (`features/*/use-*-actions.ts`). Gantt and Sequence first.                                            | new `SelectionDock.tsx`; feature action hooks                                     |
| 5     | **Default + mobile.** Make Stage the default for new users and turn the dock into a bottom sheet on phones.                                                                          | responsive view-mode hook                                                         |

Do the recolouring on the rendered SVG, **not** by injecting `skinparam` lines into the source in `sourceForPlantUmlRenderer` (`apps/web/src/render/plantuml-source.ts:15`). Injected lines would shift diagnostics line numbers and could change layout, which would break the Gantt overlay geometry.

## Risks and how to handle them

- **Recolouring can hurt author colours.** Only remap colours close to pure white or black, keep saturated colours, and give the "true render" toggle a visible spot. Add visual tests across the bundled themes in `ThemeGallery`.
- **Text-first users lose their layout.** Split stays one click away and is remembered per user. Stage is opt-in until the success metrics below are met.
- **Overlay alignment.** Drag handles and dependency overlays are positioned from SVG geometry. Recolouring touches only paint, not geometry, but every family's overlay must be retested at fit zoom.
- **E2E churn.** Many specs open ribbon groups (`openRibbonGroup` in `tests/e2e/editor-helpers.ts` has 39 callers). Keep the ribbon and its test IDs in the existing view modes, so only new specs target Stage.
- **`App.tsx` is 7,000 lines.** Build the Stage shell as a separate component that receives the same props, rather than adding more branches to `App`.

## How to know it worked

- Time from opening the app to the first visual edit (drag, link or add) drops by at least half in a 5-person hallway test.
- Diagram area when opened at 1440×900 rises from about 8 % of the viewport (measured today: a roughly 490×225 px card) to more than 60 %.
- No regression in the full three-browser E2E matrix for the existing view modes.
- Text-first users who try Stage and switch back to Split stay below 30 %. If more switch back, the Source Lens needs work before Stage becomes the default.

## A cheap first step to test the idea

Phase 1 alone (theme-native, fitted canvas in the **existing** Diagram view) is about a day of work and fully reversible. It is the visual half of the idea. If people react to it the way I expect ("oh, it's a real canvas now"), continue with phases 2–4.
