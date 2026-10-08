# Reports: Gantt task check-in

Status: implemented; email-client compatibility validation pending (see [implementation notes](reports-implementation.md))

Date: 2026-10-08

## Recommendation

Introduce a reusable **Reports** area, with **Task check-in** as its first report. It generates a polished, editable-in-email summary for each selected resource/person, asking them to confirm progress, expected finish dates, and blockers.

The main workflow should be: **choose tasks → choose people → preview each person's report → copy into email**. Default to ongoing work, include overdue unfinished work, and offer all tasks. Generate everything locally from the current Gantt data.

Make **Copy for email** the primary output. Put formatted HTML and an equivalent plain-text body on the clipboard together. Offer a separate Copy subject action, plain-text copying, and HTML download. The user reviews and sends the email in their own mail application.

This document records the feature specification. Implementation details, limits, and outstanding email-client acceptance checks are recorded in [implementation notes](reports-implementation.md). Repository observations below reflect the working tree reviewed for the original proposal, including the ongoing UI cleanup.

## 1. Existing capabilities to extend

There is useful reporting functionality already, but the inspected code does not expose a general recipient-oriented report builder:

| Existing area                                                                                 | How to reuse it                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/diagram-gantt/src/model.ts`                                                         | Tasks already contain labels, completion, dates/duration, resources with allocation, notes, links, and milestone information.                   |
| `apps/web/src/gantt-schedule.ts` and `gantt-calendar.ts`                                      | Resolve dependency-based dates and working calendars using the same rules as the editor.                                                        |
| `apps/web/src/ResourceWorkloadPanel.tsx`                                                      | Existing resource grouping and unresolved-date handling inform recipient grouping. Its resource matching currently uses case-insensitive names. |
| `apps/web/src/DiagramPreview.tsx`, `BaselineDependencyReport.tsx`, and `schedule-analysis.ts` | Existing baseline and critical-path reports remain available; share their calculations rather than duplicating them.                            |
| `apps/web/src/gantt-progress-forecast.ts`                                                     | Later optional forecast fields can reuse the forecast engine and its missing-progress/availability flags.                                       |
| `apps/web/src/projects/project-change-review.ts`                                              | Existing project change-report export is another report type that can eventually share export infrastructure.                                   |
| `apps/web/src/diagram-export.ts`                                                              | Existing clipboard and download helpers provide integration points. Add HTML report support without changing image-copy behavior.               |

Extend reporting with a small shared data/export layer and a common entry point. Avoid requiring every existing analytical panel to be rewritten before Task check-in can ship.

## 2. User experience

### Entry points

- Add `Reports…` to the existing Gantt analysis/actions area and the command palette. Avoid another permanent top-level toolbar button during the UI cleanup.
- Add `Create task check-in…` to Resources; preselect that resource when launched from a resource-specific context.
- Show a compact report chooser with Task check-in as the available template. Existing analysis views can be linked from this area without pretending they already support email export.

### Report builder

Use a roomy dialog with options on the left and the actual email preview on the right. On smaller screens, use Options and Preview steps. Keep copy actions visible.

| Setting                   | Default                                                                  | Behavior                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagram                   | Active Gantt diagram                                                     | Show document and diagram names explicitly. Cross-diagram selection is a later extension.                                                          |
| Tasks                     | Ongoing                                                                  | Also offer All tasks, Upcoming, Overdue, and Completed. Definitions below.                                                                         |
| People                    | All assigned resources                                                   | Searchable checkboxes, Select all, Clear, and per-person matching task counts.                                                                     |
| Output                    | Individual messages                                                      | A recipient list lets the user preview and copy one message at a time. Combined summary is an explicit alternative.                                |
| As-of date                | Today in the diagram's configured time zone, otherwise browser time zone | Show the time zone; use this date consistently for filters and labels.                                                                             |
| Reply by                  | Optional, unset                                                          | Include an unambiguous date in the request if set.                                                                                                 |
| Introduction and sign-off | Short default wording                                                    | Editable text, with restore-default action.                                                                                                        |
| Optional content          | Minimal                                                                  | Notes and links are off by default; all recipients can be previewed before copying.                                                                |
| Include Gantt chart       | Off                                                                      | Add a compact timeline of exactly the tasks included in the current recipient's report; show rendering status and email-specific fallback actions. |

Show a compact summary such as `4 people · 11 unique tasks · 14 assignments`. Shared tasks explain why task and assignment counts differ.

Recipient rows should show task count, attention count, and whether that exact message version was copied during this session. Use `Copied`, never `Sent`. Changing options or source invalidates the copied marker for affected messages.

### Selection rules

- Reports use explicit report filters, independent of the current canvas resource filter, zoom, viewport, or selection. Show the chosen report scope in the builder.
- After selecting a preset, allow individual tasks to be unchecked. Show `3 tasks excluded` and a Reset action; do not silently change the preset definition.
- Exclude people with zero matching tasks from generated messages, while showing them as `No matching tasks` in the selector. Never copy an empty check-in email.
- Disable copying when no people or no tasks match, with a clear explanation and a way to broaden the selection.
- A combined summary is for an explicitly chosen audience and is visibly labeled `Contains all selected people's tasks`. Individual messages contain only tasks assigned to that recipient, plus explicitly enabled context.

## 3. Exact task-filter semantics

Use resolved calendar dates, current recorded completion, and a date-only as-of value. A missing completion value means **Not reported**, not a measured 0%.

| Filter            | Definition                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ongoing (default) | Not explicitly 100% complete, and either resolved start is on/before the as-of date, resolved end is before the as-of date, or recorded completion is greater than 0%. Includes overdue unfinished work and work reported started early. |
| All tasks         | Every task in the selected diagram, including future and completed tasks.                                                                                                                                                                |
| Upcoming          | Not complete, no positive recorded progress, and resolved start is after the as-of date.                                                                                                                                                 |
| Overdue           | Not complete and resolved planned end is strictly before the as-of date. Due today is not overdue.                                                                                                                                       |
| Completed         | Explicit recorded completion of 100%.                                                                                                                                                                                                    |

Important edge cases:

- For default Ongoing, also include potentially relevant tasks that cannot be classified because dates are missing or unresolved, in a separate **Schedule needs clarification** section. Show this inclusion in the filter help and allow it to be turned off. Do not lose unknown work merely because dates failed to resolve.
- Other date-based filters show the number of unresolved tasks excluded and offer the same explicit inclusion option.
- A task ending today gets `Due today`; a past-end task with missing progress gets `Past planned finish · progress not reported`, not a claim that the work is definitely late in reality.
- A future-dated task with positive progress is included as ongoing and labeled `Progress recorded before planned start` where useful.
- Treat milestones separately: keep an explicit Include milestones option, off by default. If enabled, show their date and recorded completion; a date passing does not prove achievement.
- Show paused work as paused when supported by the existing calendar/task data. Do not classify it as blocked unless someone actually reported a blocker.
- Invalid completion values or contradictory dates produce a visible data issue, never a fabricated percentage or silently corrected date.
- An as-of date changes schedule classification; it does not reconstruct historical progress. For non-today dates, explain `Uses current recorded progress evaluated against [date]`.

Do not calculate an overall average completion in the first release: differently sized tasks and shared assignments make an unqualified average misleading.

## 4. People and shared assignments

The current resource model stores names, not verified people or email addresses. A resource may represent a team or equipment. Present resources as selectable report recipients without claiming they are contacts.

- Reuse a consistent resource identity rule across workloads and reports. Preserve display names; explicitly test case and whitespace variations. Surface ambiguous names instead of guessing that different labels represent the same person.
- If Alice and Bob share a task, include it once in Alice's report and once in Bob's, labeled `Shared with Bob` / `Shared with Alice`.
- Completion is task-wide. Allocation is resource assignment, not that person's progress; do not multiply completion by allocation or invent individual percentages.
- Count shared tasks once in a combined unique-task total and once per recipient in recipient totals.
- Provide an optional **Unassigned tasks** section for a combined coordinator summary. Do not invent an Unassigned email recipient.
- No email address is required for copy/paste. Contact mapping and address-book integration can be added later if direct sending becomes a separate feature.

## 5. Report content and visual design

Use a calm, single-column email layout: small project heading, a short request, a summary line, and well-spaced task sections. Prefer readable text, clear labels, subtle separators, and one restrained accent color. Keep it useful without images or color.

Each task should include:

1. Task name and a stable reference where available; use existing alias/identity rather than a position that changes when sorted.
2. Recorded completion as a percentage, or `Not reported`.
3. Planned start and finish, resolved with the diagram calendar; show `Unknown` and a short reason where needed.
4. A factual schedule label such as Due today, Past planned finish, Planned to be ongoing, or Future work.
5. Shared-assignment context when applicable.
6. A compact reply prompt for confirmation, updated completion, expected finish, and blockers/support needed.

Optional fields: working duration, resource allocation, selected notes, task links, and dependency context. Keep notes and dependency details opt-in to prevent internal commentary or unrelated task details appearing unexpectedly.

Sort attention items first: past planned finish, schedule/data issues, due today, then remaining work by planned finish; use stable source order to break ties. Completed and future tasks get separate sections in All tasks.

Do not label a task **On track** automatically. Planned dates and a completion percentage are insufficient evidence. The purpose of this report is to ask the recipient to confirm that assessment.

### Example individual message

Subject: `Release roadmap — task check-in for Alice — 8 Oct 2026`

```text
RELEASE ROADMAP
Task check-in · Alice · As of 8 Oct 2026
2 tasks to review · 1 past planned finish

Hi Alice,

Could you confirm whether the tasks below are on track?
Please reply by 9 Oct 2026 with any progress or date changes,
and flag blockers or support you need.

API integration [API]
Recorded progress: 60%
Planned: 1 Oct 2026 – 7 Oct 2026
Past planned finish · Shared with Bob

Confirm: On track / At risk / Blocked / Complete
Updated progress: ___   Expected finish: ___
Blockers or support needed: ___

Release notes [DOCS]
Recorded progress: Not reported
Planned: 6 Oct 2026 – 12 Oct 2026
Planned to be ongoing

Confirm: On track / At risk / Blocked / Complete
Updated progress: ___   Expected finish: ___
Blockers or support needed: ___

Thanks,
[Sender's chosen sign-off]

Snapshot of the current plan as of 8 Oct 2026.
Please correct any information that is out of date.
```

In HTML, use bold task headings, compact label/value rows, gentle background shading, and generous separation between tasks. A small progress bar may supplement the explicit percentage, but is optional and never the only progress indicator. Reply fields are ordinary text for recipients to edit or quote, not HTML form inputs.

For long reports, offer a compact layout using the same fields and one shared reply instruction. Do not silently truncate tasks; show task counts and let the user narrow the selection.

## 6. Copying cleanly into email

### Primary approach: formatted HTML plus plain text

Use one clipboard item containing `text/html` and `text/plain`, initiated by the user's Copy for email click. Build both from the same report snapshot. Keep subject copying separate because pasting a body cannot reliably populate the mail subject.

The Clipboard API supports typed clipboard data but has secure-context and browser interaction/permission requirements. Detect availability, handle rejected writes, and show success only after the write resolves. See [MDN ClipboardItem](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem) and [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API).

Suggested actions:

- **Copy for email** — formatted body with plain-text alternative.
- **Copy subject** — current recipient's subject only.
- **Copy plain text** — a deliberate, readable fallback.
- **Download HTML** — standalone report for opening, archiving, and manual copying.
- **Select report text** — manual fallback when browser clipboard access is unavailable.

If formatted copying fails, offer an explicit fallback; do not claim that a plain-text-only copy retained formatting. Explain that normal paste into a rich-text email body is required and that “paste as plain text” removes formatting.

### Email-specific HTML

Create a dedicated export template rather than copying the application's React DOM or stylesheet. Use inline styles, common system fonts, simple paragraphs and tables, modest cell padding, a fluid width with an approximately 640px reading width, and explicit foreground/background colors.

Avoid reliance on CSS Grid, Flexbox, JavaScript, external fonts, background images, SVG, or remote assets. Use semantic headings and label/value data; mark tables used solely for layout as presentational. Keep dark-mode transformations readable even if accents or backgrounds change.

Treat this as a conservative design choice, not a promise of identical output in every client. Microsoft documents formatting changes in an Outlook HTML editing workflow, reinforcing the need for real client testing: [Microsoft: formatting lost when editing HtmlBody](https://learn.microsoft.com/en-us/troubleshoot/outlook/user-interface/formatting-lost-when-editing-the-htmlbody-property). That source is not proof of clipboard compatibility; validate the proposed paste workflow separately.

Do not make screenshots or PDF the primary output: recipients need selectable, editable text for replies. An optional chart image supplements the task summaries; it does not replace them. Markdown can be an optional later export, but is not the default email paste format.

### Compatibility acceptance

Test actual normal paste into Gmail web, Outlook web/new Outlook, classic Outlook on Windows, and Apple Mail where available. Check both composed and received rendering using authorized test messages during implementation; preview alone is insufficient. Also check reply/forward, narrow reading panes, dark mode, long names, and plain-text composition. Document tested browser/client combinations and any untested clients.

The release criterion is retained content, hierarchy, dates, readable spacing, and usable reply prompts—not pixel-identical decoration.

### Optional Gantt chart in HTML reports

Add an **Include Gantt chart** toggle. Place one compact chart after the introductory summary and before the detailed task sections. Generate a separate chart for each recipient from that recipient's final filtered task list, including manual exclusions. The combined report uses the unique selected tasks once each. This should be a supported first-release option, with best-effort rendering and an explicit fallback when a chart cannot be generated or pasted reliably.

**Chart content and schedule accuracy**

- Show task names, planned bars, recorded completion where known, and an as-of marker. Include milestone symbols only when milestones are included in the report. Missing progress must look distinct from recorded 0%.
- Use the same snapshot, resolved dates, calendar, time zone, and task identity as the textual report. Display planned dates, not forecast dates, in the first release.
- Resolve dates against the complete diagram before selecting chart rows. A selected task may depend on a task assigned to someone else; filtering source declarations first could change its dates or make them unresolved.
- Draw dependency arrows only when both endpoints are included. An optional generic caption can say that dates include dependencies outside this report, without revealing excluded task names.
- Do not include unrelated rows, dividers, notes, resource labels, legends, or hidden SVG metadata from the full chart. Render a dedicated report chart rather than cropping or hiding rows in the live diagram.
- Keep all included tasks in the text. List tasks without drawable dates below the chart as `Not plotted — dates unresolved`, with a count and reason. If no tasks have usable dates, show a clear unavailable state instead of an empty chart.

**Rendering approach**

Build a report-specific timeline model from the existing parsed tasks and resolved schedule. First prototype reuse of the local renderer with generated, isolated Gantt source containing only selected tasks and explicit resolved dates. Preserve calendar rules, pauses, durations, and known completion. Verify the rendered dates against the report snapshot; avoid retaining relative expressions or external dependencies that could recalculate the subset differently.

If the existing renderer cannot preserve those semantics, use a small deterministic SVG timeline renderer over the resolved model. It must share the schedule data rather than introduce another scheduling engine. The implementation spike should choose the approach based on date fidelity, readability, and supported task features.

Use a light export theme independent of the app theme, readable task labels, and a compact legend. Fit the time axis to included scheduled tasks with a small margin; choose daily, weekly, or monthly ticks based on span. Label an as-of date outside the displayed range in the caption. Match task order to the report where practical. Render around a 640px display width and rasterize at higher resolution for sharp text. For many tasks, split into labeled chart panels with a shared time scale instead of shrinking text or silently dropping rows. Bound image dimensions and rendering work; offer fewer tasks or a text-only report if limits are exceeded.

**HTML versus email output**

| Output                          | Chart behavior                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-app preview                  | Show the generated chart and its caption alongside the exact text snapshot.                                                                                                  |
| Download HTML                   | Embed a locally generated PNG as a data URL so the downloaded file is self-contained and works offline. Keep dimensions, alt text, and the full textual summaries.           |
| Copy for email                  | Attempt the chart-bearing HTML only with a visible note that the mail editor may remove the image. Do not equate clipboard success with successful image insertion.          |
| Copy chart / Download chart PNG | Provide explicit fallback actions so the user can paste the image separately or insert the downloaded PNG into the email. For multiple panels, expose each panel separately. |
| Copy plain text                 | Keep the complete task summaries; no chart is required to understand them.                                                                                                   |

Inline base64 images have uneven email support; the [Can I email test dataset](https://github.com/hteumeuleu/caniemail/blob/main/_features/image-base64.md) records differing client results and test dates. Treat it as evidence for testing and fallbacks, not a guarantee for current mail clients. Do not use temporary blob URLs or local file paths in copied HTML, and do not upload task charts to a public image host to make them pasteable.

Keep **Copy chart** separate from body copying. Adding `image/png` alongside `text/html` as alternate clipboard representations does not guarantee the mail editor inserts both as one combined message; the [WebKit Clipboard API documentation](https://webkit.org/blog/10855/async-clipboard-api/) describes these representations and their handling. Explain the reliable fallback sequence: paste the formatted body, then copy/paste or insert the chart at the chosen position. A MIME email file with an inline attachment could be a future export, but is not required here.

**Failure and freshness behavior**

Show `Rendering chart…`, `Chart ready`, or a specific failure with Retry and Continue without chart. Do not silently omit an enabled chart. Allow text-only copying while rendering only through an explicit action. Associate image results with the full report snapshot and recipient identity; cancel or discard late results after filters, recipients, or source change. Never show one person's chart in another person's report. Chart generation stays local and leaves the source and live canvas unchanged.

The chart compatibility check must cover actual pasted and received images, blocked/stripped images, separate PNG insertion, and HTML-download offline viewing. All messages must remain useful when the chart is absent.

## 7. Data integrity and implementation shape

Create a small `apps/web/src/features/reports/` module with clear responsibilities:

| Proposed part                                     | Responsibility                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `report-model.ts`                                 | Typed options, recipient groups, task rows, source identity, dates, and warnings.                                                                            |
| `build-task-check-in.ts`                          | Pure selection, classification, grouping, stable sorting, and summary counts.                                                                                |
| `report-format.ts`                                | Shared date, percentage, and text labels.                                                                                                                    |
| `render-report-html.ts` / `render-report-text.ts` | Output serializers that consume the same snapshot.                                                                                                           |
| `report-clipboard.ts`                             | Clipboard capability checks, writes, and fallback results.                                                                                                   |
| `report-gantt-chart.ts`                           | Derive chart rows from resolved snapshot data, render isolated chart panels, rasterize PNGs, and return bounded results tied to snapshot/recipient identity. |
| `ReportsDialog.tsx` / `ReportPreview.tsx`         | Options, recipient switching, and preview of the actual exported HTML.                                                                                       |

Suggested snapshot contents: report type/version, source document and diagram identity, source/settings revision or fingerprint, generated timestamp, as-of date/time zone, scope/options, recipient identity, task rows, and warnings. Keep completion nullable and represent date-resolution errors explicitly.

Capture the source, calendar/settings, and report options together. Reuse parsed task data and existing schedule resolution; never scrape task text or dates out of the rendered SVG. The report must also work when the canvas renderer is unavailable but relevant source data is valid.

When source or settings change while the builder is open, show `Plan changed — refresh report` and require regeneration before copying. This prevents previewing one snapshot and copying another. Store a single generated timestamp per snapshot, not a new timestamp for each recipient copy.

Known-date reports require agreement between the as-of date and relative source expressions such as `today`. Inspect the current date-resolver behavior before implementation: either add an optional explicit date anchor with existing callers retaining their behavior, or adapt resolution through a shared supported API. Do not freeze only the filter date while relative source dates keep changing.

If parsing errors make assignment, completion, or schedule extraction unreliable, prevent normal generation and link to the relevant issues. For isolated unresolved dates, retain the tasks with warnings as described above. Preserved unrelated syntax should not block a report whose required fields remain reliable.

Escape all source and custom text in HTML output. Use fixed trusted markup; validate optional link schemes, omit executable content, and exclude private collaboration capability links. The generated file and clipboard body must contain only the previewed scope, not hidden source, workspace data, or another recipient's unrelated tasks.

Report generation must not mutate PlantUML, save files automatically, or create artificial undo/history entries. Keep settings session-local initially; saved report presets can later use versioned document metadata after a separate persistence design. Do not add report markup to PlantUML source.

## 8. Delivery scope

### First release

- Active Gantt diagram, all or selected people, Ongoing and All tasks plus the defined status filters.
- Explicit unresolved-date handling and optional milestone inclusion.
- Individual messages and an explicit combined coordinator summary.
- Preview, editable introduction/sign-off, optional reply deadline, and per-task exclusion.
- Email HTML/plain-text copying, separate subject, HTML download, and manual fallback.
- Optional recipient-specific Gantt charts in HTML, with local rendering, PNG copy/download, and explicit text-only fallback.
- Shared assignments, missing completion, unassigned summary, and source-change detection.
- No email service, address book, recipient accounts, direct sending, or automatic reply ingestion.

### Follow-up extensions

1. Saved presets: recurring check-in wording, task scope, and selected resources, with revalidation when resource names change.
2. Multiple Gantt diagrams in a document, retaining diagram context and composite task identities; identify linked duplicate work before offering deduplication.
3. Optional forecast and baseline fields using existing engines. Label estimates distinctly from planned dates and preserve missing-progress assumptions. Do not change the core check-in meaning.
4. Further templates: resource workload, project progress, baseline changes, and milestone outlook, sharing snapshot/render/export infrastructure.
5. Batch download of separate recipient reports and print/PDF support if users need archival outputs.
6. A separately designed response-tracking workflow with actual confirmation timestamps and explicit application of returned changes. Email text replies do not update the plan automatically.

## 9. Implementation phases and acceptance criteria

| Phase                             | Deliverable                                                                            | Acceptance                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Data rules                     | Pure report model, schedule adapter, grouping/filter tests                             | Exact-date boundaries, unknown progress, shared resources, milestones, and unresolved dates match this specification.                                   |
| B. Email template and chart spike | HTML/text serializers and a recipient-specific chart prototype with realistic fixtures | Confirm chart date fidelity, HTML-download embedding, and actual email paste behavior, including separate-image fallback, before polishing the builder. |
| C. Builder integration            | Reports entry, filters, recipient preview, copy/export                                 | A user can choose selected people, review each report, and copy the correct recipient's subject/body without changing the diagram.                      |
| D. Hardening                      | Stale-snapshot handling, error/fallback UX, accessibility, compatibility checks        | No silent task omissions, false copy success, hidden data leaks, or lost keyboard access.                                                               |
| E. Release                        | Help text, tested-client notes, usability check                                        | A coordinator can generate an ongoing-task check-in and a recipient can understand and answer it without opening the app.                               |

Focused test cases should include:

- Start/end equal to the as-of date; overdue tasks missing completion; 100% complete tasks with past dates; early recorded progress; leap days and time-zone midnight boundaries.
- Calendar exceptions, relative dates, dependency-derived dates, cycles, missing dates, and invalid completion.
- Multiple resources, repeated assignments, name variants, identical task labels, unassigned tasks, and zero matches.
- HTML escaping, unsafe URLs, very long labels, Unicode, line breaks, optional notes, and hundreds of tasks without silent truncation.
- Exact parity of HTML and text fields/counts, and isolation between recipient exports.
- Clipboard availability, permission rejection, HTML failure, plain-text fallback, and manual selection.
- Source changes and collaboration updates while previewing; copying uses the visible refreshed snapshot.
- Keyboard operation, focus restoration, screen-reader labels, narrow layouts, and email rendering checks.
- Chart scope matches the recipient and final exclusions; outside dependencies preserve dates without exposing excluded rows; missing dates, pauses, milestones, unknown progress, and long spans are handled explicitly.
- Chart rendering failure, size limits, switching recipients mid-render, and stale image results cannot yield a mismatched export; HTML charts work offline and email text remains complete when images are removed.

## Final product decision

Build **Task check-in reports** as the first reusable report template, with **one polished email body per selected person** as the default and an **optional Gantt chart of that report's tasks**. Keep the report factual, make the request for confirmation explicit, and prioritize reliable formatted copying with clear image fallbacks over direct email delivery. This addresses the immediate coordination need while providing a practical foundation for broader reporting.
