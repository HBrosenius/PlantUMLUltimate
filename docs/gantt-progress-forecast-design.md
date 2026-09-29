# Gantt progress forecast — design draft

Status: first implementation available for local testing, 2026-09-29. The agreed rules below remain the design target.

## First build status

The Gantt preview now has a document-level Progress forecast toggle, adjustable status date, read-only plan and forecast timeline, cause panel, manual remaining-work estimates, and missed-date diagnostics. Portable documents, embedded projects, and local workspace recovery preserve the setting, a chosen status date, and overrides. The forecast is shown as its own Gantt view; it does not yet draw bars over the PlantUML SVG. The current WBS editor reads and edits the linked Gantt completion value, so there are not two stored percentages that could conflict; the mismatch dialog below remains a future requirement if WBS gains an independent completion field.

## Goal

Help a project owner answer: **If the work reported complete today is all we have, when will the project finish, and which unfinished tasks cause the slip?**

The document has an optional **Aggressive tracking** setting. When enabled, the Gantt displays a progress-aware forecast beside the unchanged plan. The forecast moves unfinished work beyond an adjustable status date and propagates delays through explicit dependency links. It never silently edits PlantUML source.

## Agreed behavior

- The forecast is a view. Planned dates and source remain editable and unchanged.
- The status date defaults to today and can be adjusted. An adjusted date is a what-if calculation using **current** completion values; it does not reconstruct historical progress.
- Remaining duration starts at the task's current scheduled elapsed duration multiplied by `(100 - Complete) / 100`, rounded up to a working day. A task-level remaining-work override takes precedence until cleared. A 100%-complete task has no remaining work. The forecast does not move work earlier than the current plan.
- Missing `Complete` is treated as 0%. A task is marked **Progress not reported** only when it should already have started; future tasks are not warned.
- An unfinished task whose remaining work cannot fit before its planned finish continues from the status date, or the next working date according to its calendar. Its forecast end moves later as needed.
- Only explicitly linked successors respond to a predecessor's shift. Row order alone creates no scheduling relationship. Existing dependency types, offsets, pauses, and working calendars should retain their current meaning.
- Explicit starts and deadlines remain visible as planned constraints. The forecast may pass them and must label each missed constraint; it does not rewrite the source date.
- Linked WBS nodes and Gantt tasks share completion in a project. Unlinked Gantt tasks use their own `Complete` value.
- If an existing linked pair has different completion values, show a mismatch and ask the user which value is correct. Do not silently pick one or show a precise forecast for that task until it is resolved.
- Version one calculates shifts from progress, dates, calendars, and dependencies. Resource conflicts remain visible through the existing separate analysis; it does not silently level resources.
- The setting, a chosen status date, and manual remaining-work overrides travel with portable documents and project files. **Today** clears the chosen date, so the status date advances automatically on later days. A plain `.puml` export remains source-only; the UI must explain that forecast metadata is not included.

## Proposed screen

The document setting is **Aggressive tracking**. The Gantt toolbar exposes its current state as **Progress forecast: On/Off**, alongside an **As of** date control. Changing the toolbar state updates the document setting. The toolbar summary says, for example: **Projected release Oct 12 · +2 working days · 1 missing progress**. All numbers are recalculated for the selected status date.

The timeline uses distinct, labelled marks:

| Mark                     | Meaning                                                  |
| ------------------------ | -------------------------------------------------------- |
| Thin gray bar            | Current planned schedule                                 |
| Solid forecast bar       | Calculated schedule with reported progress               |
| Hatched forecast segment | Remaining work moved beyond its planned window           |
| Vertical line            | Selected status date                                     |
| Amber date marker        | A planned start, finish, or deadline the forecast misses |

Color is reinforced by shape, text, and accessible names. Forecast bars are initially read-only; editing the task still acts on its plan or completion field. The saved baseline is an optional comparison layer rather than a third bar shown by default.

Selecting a shifted task opens **Why did this move?** It shows planned and forecast dates, completion, automatic or manual remaining work, the constraining predecessor or predecessors, and the affected successors. Selecting a cause highlights the dependency chain in the diagram. A project summary groups shifts by their _root cause_ and lists affected milestones. It must not add overlapping chain delays together as if they were independent.

Example explanation:

> **Build starts 3 working days later.** Design is 60% complete. Its remaining work extends 3 working days beyond its planned finish. Build depends on Design, so its forecast start moves from Monday to Thursday. The release milestone also moves 3 working days.

## Detailed interaction sketch

The companion interactive mockup uses five rows: Design → Build → Test → Release, plus an unlinked Docs task. It illustrates the interface and its explanation model; the scheduling engine and exact visual treatment remain to be implemented.

### 1. Turn on tracking

The first use of **Progress forecast** sets Aggressive tracking on for the current document. A short hint says that forecast dates are read-only and PlantUML task dates stay unchanged. The selected status date starts at today. Turning it off removes forecast marks and explanation counts while preserving the setting's task overrides for later use. The control itself shows the saved on/off state on reopen.

### 2. Read the overview

The top summary leads with the projected release and shift in working days. It also shows counts of missing progress and unresolved conflicts; selecting either count filters the task list to those rows. Each task row keeps a thin planned bar and adds a forecast mark. An overdue unfinished segment is hatched amber. Planned dates that the forecast crosses get a small amber marker with a text label and tooltip. The status-date line runs through the schedule. Only rows in a selected dependency chain are highlighted; unrelated rows stay visible at normal opacity.

In the mock example, Design is 60% complete and has two working days left on Sep 29. Its plan ends Sep 28. Build, Test, and Release follow explicit links, so the release moves from Oct 8 to Oct 12. Docs has no completion value, so it is marked **Progress not reported** and forecast from 0%; because it has no link to Release, it does not add to the release delay.

### 3. Select a shifted task

Clicking Build opens **Why did this move?** in a side panel. It compares planned and forecast dates, labels the missed planned finish, then names the immediate cause: Design's remaining work. The dependency chain shows Design → Build → Test → Release. Selecting another row updates the explanation without changing source. For a task with two binding predecessors, the panel lists both causes. A release summary traces back to the earliest unresolved work without summing the same slip along every link.

### 4. Adjust the scenario

The **As of** picker changes the working date used by the calculation and labels the result **What-if using current progress**. It does not imply that today's percentages were known on a past date. In the task panel, a **Remaining work** field starts with the automatic estimate; entering a number marks it **Manual estimate** and recalculates descendants. **Use automatic** clears the override. The override belongs to the document metadata, so a portable/project save preserves it. Changing only the status date changes the preview, not task source.

### 5. Resolve data problems

Selecting a missing-progress row shows **Complete not reported · assumed 0%**, its forecast effect, and a direct action to edit Complete. An existing linked WBS/Gantt mismatch shows both values, their locations, and **Choose completion**; the conflicting task and its descendants show **Forecast needs a decision** until the mismatch is resolved. The dialog must show the exact source fields that would change before applying the choice, as a single undoable edit if that behavior is approved. A missed explicit start or deadline appears in the task panel with planned date, forecast date, and the chain that pushed it past the constraint. An unresolvable cycle shows **Cannot forecast** and links to the involved tasks.

### 6. Save and share

Saving a portable document or project stores the on/off setting, a chosen status date, and remaining-work overrides. When **Today** is selected, no fixed date is stored. The save/export flow for plain `.puml` states that it contains task source but not forecast settings or overrides. The forecast never applies its dates to the source implicitly.

## Forecast rules to specify and test

1. Resolve the current plan using the existing Gantt schedule and calendar rules. This is the comparison point; a saved baseline remains a separate historical snapshot.
2. For each task, calculate remaining work from `Complete` or its manual override. Use the current scheduled elapsed duration so existing task allocation semantics remain consistent, without adding resource leveling.
3. Place remaining work no earlier than the task's planned start, the status date, or an applicable dependency constraint. Keep any completed portion informational; a percentage alone does not establish the exact dates on which past work occurred.
4. Calculate a task's forecast finish without pulling it earlier than its planned finish. Propagate later starts and finishes through the dependency graph. If several predecessors constrain a task equally, show all of them as causes.
5. Record why every date moved: overdue remaining work, a predecessor's forecast, a calendar closure, or an explicit-date conflict. If the schedule is cyclic, incomplete, or has no calculable duration, show **Cannot forecast** with the reason rather than inventing a date.
6. Recalculate when completion, duration, dependencies, calendar, status date, or override changes. Changes to the view alone do not dirty the PlantUML source.

## First-version acceptance examples

- A ten-working-day task at 50% completion has five working days remaining by default; changing its override changes the forecast and marks it **Manual estimate**.
- An overdue unfinished task extends beyond the status date; a linked successor and its milestone move, while an unlinked later row stays put.
- A 100%-complete task creates no new delay. A task without `Complete` behaves as 0% and is flagged.
- A forecast can cross an explicit date, but the planned date remains visible and receives a missed-date explanation.
- Closed weekends and dates affect the remaining-work finish and successor placement.
- Switching the forecast off restores the ordinary view without source edits. Saving and reopening a portable document or project restores the setting, chosen status date, and overrides.
- Linked WBS and Gantt completion is consistent in both views. An existing mismatch is flagged and requires a user choice before that task receives a precise forecast.
- The cause panel explains a diamond dependency without double-counting delay; cyclic and unresolvable schedules show diagnostics.

## Open decisions

1. **Resolving linked completion:** decide whether the user's choice writes the chosen percentage into both linked sources immediately or proposes a reviewable two-document edit.
2. **Milestones:** decide whether an incomplete milestone with no predecessor and a date in the past forecasts at the status date or remains an overdue marker only.
3. **Time-zone rule:** define which calendar date "today" means for collaborators in different time zones, while allowing the selected status date to be shared in a review.
4. **Plain-source warning:** decide the exact save/export message for `.puml` so users understand which metadata remains only in the portable/project file.

## Scope boundary

Version one does not infer dependencies from row order, estimate future progress, reconstruct historical completion, level resources, or automatically apply forecast dates to source. A later explicit **Apply forecast to plan** action could be designed separately after users trust the forecast and its explanations.
