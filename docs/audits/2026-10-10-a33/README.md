# A33 — Task-focused mobile workflow

## Implemented scope

At phone widths (600 px or narrower), Gantt and WBS open in a task/work-package list unless the user explicitly chooses Code or Diagram. Gantt supports task/resource search and all/incomplete/unassigned scopes. WBS shows hierarchy level and parent context, with parent/child navigation in its full-screen properties sheet. Both offer View on diagram without opening an editing inspector. Desktop view preferences are preserved; an existing desktop task table keeps its table/chart controls when resized to a phone.

Gantt check-in stages progress (%) and resource assignments/allocations together. Apply reuses `editTaskRow` and the existing validated source-history commit, preserving aliases, dependencies, comments, unsupported source and unrelated fields. The whole check-in is one Undo/Redo step. Invalid, stale and viewer drafts cannot apply. Cancel/Escape discards the draft and restores the actual opener, including touch activation in Safari. Navigation and document changes unmount the sheet safely. Milestones remain readable and direct users to their diagram inspector for edits.

The sheet uses a scrolling body and separate header/footer actions, 44 px controls, 16 px text inputs, safe-area padding and visualViewport resize/scroll handling. The surrounding workspace is inert while it is open. Open sheets and staged drafts survive portrait/landscape breakpoint changes; closing restores the desktop layout when appropriate. Hardware-keyboard focus stays in the sheet; source/navigation shortcuts are isolated while input undo remains local. Its colors follow the app theme. Long titles are bounded so they cannot push required actions out of the sheet. viewport-fit=cover enables device safe-area insets.

## Evidence and validation

Baseline phone UI: [A27 table](../2026-10-09-a27/phone.png) and [A14 task properties](../2026-10-09-a14/task-properties-phone.png). New captures in this directory show the task list, check-in with a reduced visual area, WBS navigation and dark appearance. Captures are browser emulation, not physical-device evidence.

218 unit files / 2,288 tests passed. Focused tests cover staging, validation, cancellation, stale/viewer drafts, failed commits, source preservation, WBS hierarchy and visualViewport resize events. Production build and changed-file lint/format/whitespace checks passed. Eighteen browser cases passed across Chromium, Firefox and WebKit for touch-emulated check-in, single-step Undo/Redo, cancellation/focus restoration, WBS navigation, View on diagram and existing table/chart/desktop continuity. Four additional appearance/keyboard/zoom cases passed: dark theme and hardware-keyboard focus trapping/restoration in all three engines, plus Chromium page-scale zoom. The CDP-only zoom case is skipped in Firefox/WebKit. After the orientation fix, three check-in/Undo cases were repeated successfully across all engines with a portrait-to-landscape transition. Total final coverage: 22 browser cases plus three orientation rechecks; two unsupported CDP zoom cases skipped. Screenshots were inspected in light/dark appearance, including reduced viewport actions.

## Real-device completion gate — pending

No physical touch device or native software keyboard was exercised in this environment. Reduced viewport tests and Chromium browser page-scale tests do not prove native keyboard, browser chrome or notch behavior. A33 implementation is delivered, but the plan's real-device completion gate remains open.

Before declaring mobile completion, verify on iOS Safari and Android Chrome:

1. Open a task, change progress and add/edit a resource with the native keyboard open. Confirm Cancel and Apply remain reachable in portrait and landscape, including safe areas.
2. Apply, then Undo/Redo. Confirm one complete check-in is undone/redone and dependencies/source context remain intact.
3. Cancel a draft and navigate WBS parent/children, then View on diagram. Confirm no accidental edit or precision drag is required.
4. Check external-keyboard navigation, enlarged browser/text settings and screen-reader labels/focus on the actual devices.

Record device/OS/browser versions and results here before closing that gate.
