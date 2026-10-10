# A23 — Outline and canvas Find

- Modal, desktop dock and canvas Find share the same element index and search function. Search includes displayed type, label and complete ancestor path; all query words must match. Clear resets search and focuses the field; empty results distinguish no indexed elements from a type filter/query miss.
- WBS nodes and package/partition children display ancestor paths and indentation in the dock. Source order retains the hierarchy. The optional dock reserves 280px in the workspace at widths of at least 1,100px. Smaller windows automatically use the modal; the dock preference lasts for the current document/session.
- Ctrl/Cmd+F is handled only from canvas/preview focus. CodeMirror keeps its own search. An explicit Find in diagram button also opens search, revealing a preview when starting from Code view.
- Matching rendered targets receive temporary accent styling. Selecting results uses existing inspector selections and scrolls to the target; Find/dock preserve Diagram view. Modal Outline retains source reveal. Closing clears match markers; document switching closes navigation. Canvas Find restores prior canvas focus on close.
- Escape closes the active modal/Find while retaining the selected task inspector. The prior regression that expected both layers to close was updated to this behavior.
- Rendered result rows start at 200 with Show more. A 5,000-entry unit case verifies bounded initial rendering and finding an entry at the end. Occurrences append to groups in place; line lookup uses one line-start index. No broad latency benchmark is claimed.
- No source mutation, calendar/resource model, diagram movement or authored layout change is introduced. Export paths still use the unmodified renderer result.

## Validation

- Full unit suite: 201 files / 2,161 tests passed (`/tmp/a23-unit.log`). Final focused Outline/inspector checks: two files / 14 tests (`/tmp/a23-focused-final.log`).
- Production build includes TypeScript (`/tmp/a23-build-final2.log`). Changed-file lint and formatting checks pass.
- New browser journeys and existing Outline/constrained-layout regressions run in Chromium, Firefox and WebKit (`/tmp/a23-browser-complete.log`). They cover ancestor search, exact selected label, dock resizing to modal, source Find isolation, canvas Find, visible match targets, cleanup, Escape and phone access.
- Inspected screenshots: `a23-docked-outline.png`, `a23-canvas-find.png`, `a23-outline-phone.png`.

## Minimap decision and renderer boundary

A minimap remains conditional on evidence that it improves navigation beyond shared search, hierarchy and native scrolling. No competing minimap or Timeline slider was introduced. Revisit with a measured diagram/navigation task.

The initial WBS test fixture rendered wider than 5,000px and hit the existing 4,096px browser renderer limit. The navigation fixture uses 27 nodes within that limit; the index/UI test separately covers 5,000 entries. Renderer limits were not changed.
