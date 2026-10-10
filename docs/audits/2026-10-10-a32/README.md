# A32 — Local presentation and anchored review

Entry point: More → Presentation & local review. The presentation covers the workspace and makes the editor inert. Only navigation, zoom, named views and local review controls are shown. Named views store an ordered set of object highlights and a zoom level. Previous/Next and left/right arrows step through highlights. Fit restores a whole-diagram view. Connected-diagram navigation follows existing open WBS/Gantt connections and native project WBS/Gantt and semantic relationships, including closed project diagrams. Navigation changes the presentation, without changing the editor's active document or source.

## Collaboration and audience audit

- `apps/web/src/collaboration.ts`: collaboration roles are editor and viewer.
- `apps/collaboration-worker/src/index.ts`, `CollaborationRoom.webSocketMessage`: viewer document updates are rejected server-side; presence has a separate path.
- `apps/web/src/collaboration-document.ts`: shared state contains diagrams, settings, elements and links; no shared review-comment model exists.
- Existing collaboration URLs grant room access with editor/viewer credentials. They are not review links and do not include these local notes.

This delivery creates personal notes only. The review panel explicitly identifies the audience as the person using this browser, states that notes/views are excluded from files, exports and collaboration links, and grants no source-editing rights. Personal metadata is available while reading, including a collaboration viewer, without modifying shared source or bypassing room permissions. Shared review links remain a separate release as required by the plan.

## Persistence and anchors

Schema version 1 localStorage records are keyed by the existing document history identity. Notes retain immutable text, creation time, original source revision and declaration excerpt, plus a mutable resolved state. Named views retain their original ordered anchors. They survive dialog closure and browser recovery; clearing browser data removes them. Opening a separate copy with a different document identity does not import notes. Source history/Undo and file dirty status are untouched. Storage failures are reported; invalid or newer data is preserved and writes are disabled.

Aliased Gantt tasks support source insertion, duration and label changes through an unchanged unique alias. Resolution shows Current or Updated and retains the original label/source context. Missing targets show Missing; duplicate identity candidates show Ambiguous. Other object anchors are revision-bound and become Stale after source changes; parser indices are never treated as stable cross-revision identity. Rendered highlights require a unique matching label; otherwise the source context is offered without guessing. Deleted anchors are kept with their original context rather than silently reassigned. Alias deletion/reuse across unobserved revisions cannot prove identity; review context remains visible and Updated means alias match, not a global identity guarantee.

## Validation

217 unit files / 2,283 tests passed. Focused tests cover alias updates, duplicate alias refusal, deleted/stale anchors, document isolation, versioned persistence, invalid storage protection, quota-failure draft retention, local note resolution, connected navigation and keyboard isolation. Production build, changed-file lint/format and whitespace checks passed. Desktop and 390 × 844 screenshots were inspected; screenshot inspection corrected a width-only Fit implementation to account for both dimensions. All nine browser cases passed across the three engines. Firefox had one process crash during connected navigation in the combined run; its complete three-case rerun passed. Browser tests cover the walkthrough, note persistence across supported edits and browser recovery, source protection, focus/Escape behavior, connected WBS/Gantt navigation and presentation of the other five diagram families across Chromium, Firefox and WebKit.
