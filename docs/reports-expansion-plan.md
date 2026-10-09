# Reports expansion roadmap

Date: 2026-10-08

Status: proposal for future implementation

## Direction

Expand Reports into a small collection of useful decision-making templates: what needs attention, what determines delivery, how much work remains, what changed, and who needs support.

Build on the [Task check-in and optional Gantt chart plan](reports-feature-plan.md). Reuse its report builder, recipient filters, snapshot model, HTML/plain-text exports, and chart image fallbacks. This roadmap adds report types; it does not replace that plan or implement changes.

The recommended first expansion is **Critical path**, **Progress and due-date outlook**, and **Milestone outlook**. Introduce durable reporting snapshots alongside these so a trustworthy historical **Burndown/Burnup** can follow. Baseline changes and resource workload are strong next additions because calculations already exist in the application.

## 1. Report catalogue

### Should have: core reports

| Report                                    | Main question and audience                                              | Suggested contents                                                                                                              | Data/readiness                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Task check-in                             | “Are your tasks on track?” — individual assignees                       | Assigned tasks, recorded completion, planned dates, reply prompts, optional personal Gantt.                                     | Already planned separately; foundation for the report system.                                            |
| Critical path and schedule sensitivity    | “Which tasks determine the finish date?” — project lead                 | Critical tasks, dependency chains, total/free slack, near-critical tasks, owners, unresolved analysis issues.                   | Existing schedule-analysis engine; validate its coverage and present limitations.                        |
| Progress and due-date outlook             | “How much work remains, and when is it due?” — project lead/team        | Completion-weighted remaining work, overdue remainder, upcoming due buckets, planned remaining-work curve, current observation. | Current task completion and resolved end dates suffice; history is not required.                         |
| Historical burndown and burnup            | “Are we reducing remaining work over time?” — project lead/stakeholders | Recorded remaining-work trend, planned reference, completed-work and scope lines, scope-change events.                          | Requires comparable dated observations; cannot reconstruct actual history from today's completion alone. |
| Milestone and delivery outlook            | “Which commitments need attention?” — stakeholders                      | Upcoming/past milestones, planned and optional forecast dates, contributing tasks, unresolved dependencies.                     | Current schedule; forecast can reuse existing forecast engine.                                           |
| Changes since baseline                    | “What changed since the agreed plan?” — project lead/sponsor            | Added/removed tasks, shifted dates, changed dependencies, completion deltas, scope changes, finish-date change.                 | Existing baseline/change calculations; identity matching must be trustworthy.                            |
| Resource workload and assignment coverage | “Who is overloaded or missing work assignments?” — coordinator          | Allocation versus configured capacity, conflict periods, affected tasks, unassigned work, unknown schedules.                    | Existing workload calculations; capacity assumptions must be visible.                                    |

### Could have: useful second wave

| Report                | Value                                                                                                         | Additional requirements                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Weekly project digest | One short stakeholder email: newly recorded completions, next due tasks, schedule changes, decisions needed.  | Compare two snapshots; distinguish “first recorded complete” from actual completion date.          |
| Next 7/14/30 days     | Operational lookahead grouped by person or due date, including overdue carry-over.                            | Mostly a preset over current data; do not build another independent calculation engine.            |
| Forecast versus plan  | Planned versus projected finish, affected milestones, delay causes, remaining-duration assumptions.           | Reuse current forecast engine; disclose missing progress and manual estimates.                     |
| Dependency handoffs   | Cross-person/team handoffs coming due and the receiving tasks they affect.                                    | Reliable assignments and dependencies; shared assignments do not imply a single accountable owner. |
| Schedule data quality | Missing completion, unresolved dates, cycles, unsupported analysis, unassigned work, ambiguous task identity. | Reuse diagnostics and report data-quality flags; link to actionable source locations.              |
| WBS delivery coverage | WBS items without linked Gantt work, unmatched tasks, and link inconsistencies.                               | Reuse existing WBS/Gantt link checks; do not count linked representations as separate work.        |
| Scenario comparison   | Compare delivery alternatives by finish date, changed tasks, and resource conflicts.                          | Connect to Scenario Lab; label hypothetical results separately from the current plan.              |

### Nice to have: later, when the supporting data exists

| Idea                             | Why it could be useful                                                        | Gate before implementation                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Milestone trend chart            | Show successive forecasts of the same milestone to reveal repeated slippage.  | Dated snapshots with stable milestone identity.                                                                      |
| Multi-project overview           | Compare delivery outlook and attention items across documents.                | Explicit project selection, identity isolation, compatible metrics, and shared-resource rules.                       |
| Check-in response coverage       | Show requested, answered, and overdue confirmations.                          | Actual request/reply records; clipboard copying is not evidence that an email was sent.                              |
| Risk and blocker register        | Summarize reported blockers, owners, impact, and actions.                     | Structured user-entered blocker/risk data; notes or low completion are not enough to infer blockers.                 |
| Report packs and saved presets   | Reuse a weekly combination of summary, burndown, critical path, and workload. | Stable report schemas, versioned presets, and stale-filter detection.                                                |
| Scheduled generation or delivery | Reduce repeated preparation of recurring reports.                             | Separate automation design, explicit sending authorization, and a runtime that actually runs when the app is closed. |
| Cost/earned-value reporting      | Support budget tracking and cost variance.                                    | Explicit effort, cost, and baseline-budget models; duration and completion alone are insufficient.                   |
| Narrative summary                | Offer a concise draft explanation of measured changes.                        | Every statement grounded in report data, editable before export; do not invent causes or commitments.                |

Avoid turning the first release into a dashboard catalogue. Ship a few complete reports with clear questions, useful exports, and reliable calculations.

## 2. Burndown based on completion and task finish dates

### Two related views, with different meanings

The proposed completion/end-date chart is useful immediately. However, a task that is 60% complete today and due Friday does not tell us whether that progress happened Monday or Thursday. Build two views and label them accurately:

1. **Progress and due-date outlook:** current remaining work grouped by planned finish date, plus a planned reference curve and today's recorded position.
2. **Historical burndown:** recorded remaining work at successive reporting dates, once history is available.

Do not distribute today's completion backwards over past days to create an invented actual burndown. A scheduled finish date is not an actual completion timestamp.

### Measurement options

Start with **Task equivalents**: every normal task has weight 1. A task at 60% completion has 0.4 task equivalents remaining. Label the axis explicitly; this is not the integer count of unfinished tasks or a measure of labor hours.

Offer **Planned working-day weight** as an optional alternative once calendar-aware weights are verified. A 10-working-day task at 60% has 4 weighted working-day units remaining. Label this a duration-weighted progress proxy, not actual effort or a promise that four calendar days will finish the task. Parallel work means summed duration is not project duration.

Keep task equivalents as the default because duration is not necessarily effort. Do not multiply by resource count or allocation. Exclude milestones from weighted work; report them separately. Preserve fixed baseline weights for a comparable trend; changing weights is an explicit scope/re-estimation event.

### Formulas and missing data

For included task `i`, let `w_i` be its chosen fixed weight, `c_i(t)` its recorded completion at observation `t` as a fraction, and `d_i` its resolved planned finish date.

```text
Known remaining(t) = sum(w_i × (1 − c_i(t))) for tasks with valid completion
Unknown weight(t)  = sum(w_i) for tasks without valid recorded completion

Total remaining lies between:
  Known remaining(t)
  Known remaining(t) + Unknown weight(t)

Planned remaining at end of date d = sum(w_i where d_i > d)
```

Default to a **range/band** for unknown completion, with the unknown count visible. An optional conservative line may assume unknown completion is 0%, but must say so in the legend and exported report. Never quietly treat missing progress as a measured zero.

Tasks with unresolved end dates contribute to current remaining work where their weight is known, but go into an **Unscheduled** bucket and cannot be placed on the dated plan curve. Label that curve's smaller coverage explicitly. For duration weighting, unresolved weights are excluded from numeric totals with an explicit count; never substitute a weight of 1 in a different unit.

The planned end-date curve is a **staircase**: a task's full planned weight leaves the remaining total at the end of its planned finish date. This directly supports the requested finish-date-based view. An optional later reference may spread work uniformly across working days between start and finish, but must be labeled a planning assumption.

### Suggested layout

- Header: scope, as-of date, measurement unit, baseline, and progress-data coverage.
- Summary: recorded completion coverage, known/unknown remaining, past-due remainder, next due date, and planned finish.
- Main chart: planned remaining-work staircase; actual observed points or historical line only where observations exist; a shaded unknown range where needed.
- Supporting chart: current remaining work due per week, with separate Past due and Unscheduled buckets. This is a due-date distribution, not a historical trend.
- Details table: task, owner(s), recorded completion, weight, remaining contribution, planned finish, and data issues.

Example with equal task weights as of the end of 8 Oct 2026:

| Task  | Completion   | Planned finish | Remaining contribution         |
| ----- | ------------ | -------------- | ------------------------------ |
| API   | 60%          | 7 Oct          | 0.4 task equivalents, past due |
| Tests | 25%          | 10 Oct         | 0.75 task equivalents          |
| Docs  | Not reported | 12 Oct         | 0–1 task equivalents, unknown  |

Show **1.15 known remaining + up to 1 unknown**, not a precise 2.15 actual value. For this three-task scope, planned remaining at the end of 8 Oct is 2.0. Only a current observation exists; do not draw a historical actual line through earlier dates.

### Historical trend and scope changes

- Add an explicit **Record progress snapshot** action; capture only when requested or under a separately enabled capture policy. Report preview alone must not create historical observations.
- Connect observed values as a step series labeled “last recorded progress.” Mark observation dates and gaps. Carrying a value forward is not proof that nobody made progress.
- Store observation time separately from any user-declared effective date. Backdated entries require a visible label; never overwrite original observation time.
- Show additions, removals, weight changes, and completion corrections as separate events. Deleting unfinished work reduces scope; it is not completed work.
- Offer a default **Fixed baseline scope** trend and an explicit **Current scope over time** mode. Fixed scope retains baseline members; removed members are marked as removed with no fabricated later progress. New tasks appear as additions outside baseline totals.
- Pair burndown with **Burnup**: total scope versus recorded completed task equivalents, with uncertainty where completion is missing. Keep scope removal visible so a drop in remaining work cannot be mistaken for delivery.
- Baseline start and finish dates stay frozen unless the user explicitly rebases. Rebaselining starts a labeled segment, preserving the previous reference.
- Keep person filters fixed to baseline membership for baseline trends, or mark assignment changes in dynamic views. Reassignment must not masquerade as a person's completed work.

Burndown and burnup are established complementary views; Atlassian describes remaining-work reporting and distinguishes completed work from total scope in its [burndown tutorial](https://www.atlassian.com/agile/tutorials/burndown-charts) and [burnup report documentation](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-burnup-report/). The formulas above are proposed product semantics, not a claim that PlantUML already implements those reports.

## 3. Critical path and schedule sensitivity report

### Report purpose

Identify tasks that determine planned completion and tasks with little room to move. The report should explain the result, not just highlight red bars. Critical path is a dependency/schedule property; an overdue task is not automatically critical, and a critical task is not necessarily currently late. Microsoft's [critical-path guidance](https://support.microsoft.com/en-us/project/manage-your-project-s-critical-path) explains the relationship between critical tasks and slack.

### Contents

- Project planned finish, analysis scope, and whether the analysis is complete.
- Critical task list and supported dependency chains, with a focused Gantt or dependency diagram.
- Task name, owners, planned dates, recorded completion, total slack, free slack, and latest allowable dates where provided by the engine.
- Plain-language definitions: total slack is the available delay relative to the analyzed project finish; free slack is delay before affecting a successor under the engine's scheduling rules.
- Near-critical tasks using a configurable threshold; propose 2 days initially, explicitly labeled with the engine's verified day units.
- An attention list: unfinished critical tasks past planned finish, missing completion on critical tasks, and unresolved analysis data.
- Optional later comparison: tasks that became critical since a baseline or prior report.

### Correctness rules

- Analyze the full relevant dependency graph before filtering visible rows or people. A recipient-specific view should say **Your tasks on the project critical path**, not calculate a new critical path from only that person's tasks.
- Show multiple critical branches when supported. Do not present one chosen chain as the only possible critical path. Bound chain enumeration for large graphs and disclose when paths are summarized.
- Inspect `chainsByTask` behavior before promising exhaustive path enumeration: current code retains representative continuations in places. The report must state whether it shows representative chains or all branches.
- Cycles, unresolved dates, and unsupported relations must produce an unavailable or clearly partial report, not “No critical tasks.” Analysis blockers are data/calculation issues, distinct from blockers reported by assignees.
- Reuse `analyzeCriticalPath` and its actual supported relations/calendars. Confirm total/free slack units and constraint handling with fixtures before adding labels or thresholds.
- Do not expose the engine's synthetic reference date for undated diagrams as a real project date. Either offer duration-only analysis clearly labeled or require resolved project dates.
- Keep **Planned critical path** separate from a future **Forecast critical path**. Do not imply that applying completion percentages alone recalculates criticality accurately.
- Explain that resource contention can cause delivery problems beyond dependency criticality; link to Workload rather than claiming a resource-constrained critical-path calculation.

## 4. Other core reports in more detail

### Milestone and delivery outlook

Use a concise stakeholder table: milestone, planned date, optional forecast date, date movement, contributing critical tasks, and issues requiring review. Sort past planned dates and near-term milestones first. Passing a milestone date does not establish achievement; show recorded completion only when explicitly available. Unknown forecasts remain unknown. Include an optional focused timeline.

### Changes since baseline

Compare the current snapshot with a named, dated baseline. Separate schedule movement, scope changes, dependency changes, assignment changes, and completion changes. Show before/after dates and units. Distinguish renamed tasks from removed/added tasks only when identity matching supports it; otherwise flag uncertain matches for review. Include a project-finish comparison and a short list of the largest changes. Do not invent a reason for a change from the difference alone.

### Resource workload and assignment coverage

Show a heatmap or daily/weekly allocation chart plus a readable table of capacity exceedances, duration, and affected tasks. Display configured capacity and calendar assumptions; “150% allocated against 100% capacity” is useful, “Alice is performing badly” is not supported. List unassigned tasks and work excluded from load calculations because of unknown dates. Shared tasks contribute per-resource allocation to workload, but only once to project completion. Do not reduce scheduled load by completion without an explicit forecast-workload mode.

### Weekly digest and lookahead

Assemble existing report sections into one short email: changes since the last selected snapshot, newly recorded completions, upcoming due tasks, critical attention items, and requested decisions. Default to a summary with links or attached details rather than duplicating every task. Without an earlier snapshot, label it **Current project summary** and omit “this week's changes.”

## 5. Reporting history and shared architecture

Current code offers useful inputs:

- `apps/web/src/schedule-analysis.ts`: critical task IDs, slack, latest dates, analysis blockers, chains, and baseline variance helpers.
- `apps/web/src/gantt-schedule.ts` and `gantt-calendar.ts`: shared date/calendar resolution.
- `apps/web/src/gantt-progress-forecast.ts`: existing forecasts and missing-progress flags.
- `apps/web/src/ResourceWorkloadPanel.tsx`: resource allocation calculations.
- `apps/web/src/workspace-storage.ts` and `document-format/history-mapping.ts`: dated source versions and retained portable history.

Source history is a useful starting point, but it is not automatically a trustworthy progress ledger. A source version timestamp is a capture time, not necessarily the date someone performed work, and retained history may be sparse. Historical settings/calendars may also be incomplete. Offer explicit import of suitable history as **Reconstructed from retained versions**, with coverage and missing-context warnings; never silently treat every version as a daily observation.

Design versioned reporting snapshots with:

- Document/diagram identity, stable task identity, source fingerprint, and snapshot ID.
- Captured timestamp, optional effective reporting date, time zone, and provenance.
- Completion values including unknown states, planned dates, assignments, weights/units, calendar context, and relevant dependencies.
- Baseline identity, scope membership, and scope/re-estimation events.
- An explicit retention/pinning policy for reporting observations separate from ordinary undo history.

Store snapshots in versioned document metadata with a portable-format migration and recovery plan. Respect existing encryption and storage choices; do not create unencrypted report-history sidecars for encrypted documents. Opening an older document with no reporting history must still support current-state reports. This metadata design is a prerequisite to historical trend release, not an incidental UI setting.

Extend the planned report modules with pure metric builders and shared chart renderers. Each report should declare its required data, supported scope, calculation version, warnings, available outputs, and whether history is required. Add report types incrementally rather than building a general-purpose dashboard designer.

## 6. Consistent report experience

- One report chooser grouped by purpose: People, Delivery, Progress, Changes, and Data quality.
- Shared options: diagram/project scope, people, as-of date, baseline where relevant, optional charts, and concise/detailed layout.
- Show required data before generation: “Historical burndown needs at least two comparable observations,” while still allowing a single current point in Progress outlook.
- Every report includes scope, date, units, assumptions, data coverage, and unavailable calculations.
- Reuse HTML/plain-text copying, PNG chart copy/download, standalone HTML, and email fallbacks from the original plan. Charts must have legends, units, captions, and equivalent tables.
- Use consistent semantics: planned versus forecast, measured versus assumed, completed versus removed scope, unknown versus zero. Color is supplementary.
- Only expose the selected audience's data. Cross-person dependencies needed for analysis can remain internal to the calculation; omit excluded names/details from recipient exports.
- Freeze the source/options snapshot for preview and export. Warn and refresh when the underlying source changes.
- First support one Gantt diagram. Add multi-diagram reports only after identity, shared resources, calendars, and duplicate linked work have explicit rules.

## 7. Recommended delivery order

| Phase                         | Deliverables                                                                                              | Why this order / exit criterion                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Shared report foundation   | Existing Task check-in plan, HTML/text output, optional Gantt images, common scope and data warnings.     | Establish one reliable create/preview/export workflow.                                                                                    |
| 2. Immediate schedule insight | Critical path, Progress and due-date outlook, Milestone outlook; begin explicit reporting snapshots.      | Useful with current data; start collecting evidence for future trends.                                                                    |
| 3. Historical progress        | Versioned snapshot persistence, fixed/dynamic scope rules, Burndown and Burnup.                           | Ship only after snapshot round-trip, task identity, unknown progress, and scope-event tests pass.                                         |
| 4. Planning control           | Baseline changes, Resource workload, Weekly digest, Lookahead, Data quality.                              | Reuse validated calculations and compose existing report sections. Data-quality warnings themselves must already exist in earlier phases. |
| 5. Optional expansion         | Forecast comparison, handoffs, WBS coverage, scenarios, saved packs; then portfolio/automation if needed. | Prioritize by actual use; avoid adding data models solely for speculative charts.                                                         |

Critical path and current progress outlook are medium-sized integrations if their calculations are reused. Historical burndown is a larger feature because trustworthy history, identity, and scope accounting matter more than drawing a line chart. Cost, response tracking, and cross-project reports are separate investments.

## 8. Acceptance tests and product checks

### Burndown and history

- Verify the worked example above and known 0%, 100%, missing, and invalid completion values.
- With one observation, show one actual point; never generate earlier actual progress.
- Test past-due work, end-date equality, unresolved dates, milestones, non-working days, task pauses, and time-zone boundaries.
- Verify adding/removing tasks, changing durations, renaming tasks, reassignment, completion corrections, and rebaselining without false completion gains.
- Confirm fixed weights, stable units, snapshot persistence/export/import, retained-history gaps, and disclosed reconstruction assumptions.
- Confirm completed-equivalent plus remaining-equivalent equals total weight for fully known, consistent scope; unknown ranges reconcile when progress is incomplete.

### Critical path and other reports

- Test a simple chain, parallel branches, multiple equally critical branches, near-critical tasks, lags, supported relationship types, calendar exceptions, disconnected tasks, cycles, and unresolved dates.
- Compare reported slack and dates against the engine on known fixtures; filtering by person must not change project criticality.
- Baseline reports distinguish additions/removals from progress; workload reports preserve per-resource allocations without duplicating project work totals.
- Milestone past dates do not imply completion; missing forecasts do not become zero delay.

### Shared quality

- HTML/text/table/chart numbers agree and carry the same snapshot identity, units, and scope.
- Client compatibility, clipboard errors, image fallbacks, keyboard use, long names, many tasks, and stale previews follow the original Reports plan.
- A user can explain what each line means, what the report cannot know, and which action to take next.
- No report changes the plan, publishes data, sends email, or writes progress history merely because its preview was opened.

## Recommended scope decision

Commit to a small core: **Task check-in, Critical path, Progress/due-date outlook, Historical burndown/burnup, Milestone outlook, Baseline changes, and Resource workload**. Treat lookahead and weekly summaries as convenient combinations of those capabilities. Keep advanced reports gated by the data they actually need.
