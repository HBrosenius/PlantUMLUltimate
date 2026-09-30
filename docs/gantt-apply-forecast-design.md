# Apply forecast to plan — design draft

## Goal

Let an editor deliberately promote the current Progress forecast into the PlantUML plan. The action must show the exact source changes and the resulting schedule before it writes anything. It must remain separate from the read-only forecast toggle.

## Important distinction

For an in-progress task, the forecast `start` is the start of **remaining work** at the status date. It is not the task's original start. Applying that value as a new task start would erase the planned record of work already done. The plan should retain the original start and adjust its finish or duration instead.

## Proposed flow

1. The forecast view offers **Apply to plan…** when a forecast date is later than its planned date. Viewers without edit permission cannot use it.
2. Opening the review freezes the source revision, status date, completion values, remaining-work estimates, and calculated forecast. It does not edit the document.
3. The review shows planned and proposed project finish, working-day shift, and every affected task. Each row distinguishes a **source edit** from a **date moved by dependency**. It marks explicit dates and milestones that will change.
4. The editor can inspect the exact before/after PlantUML declarations. The app reparses the candidate source and checks that its schedule matches the reviewed dates. Unresolved dates, dependency cycles, unsupported source syntax, a schedule mismatch, or a stale source revision prevent application until recalculated or fixed.
5. **Apply** commits that validated candidate as one undoable history step. It checks the source revision and forecast inputs once more immediately before committing.

The review should make the difference between edits and consequences obvious:

| Task             | Planned → proposed          | Why                                | Source action                          |
| ---------------- | --------------------------- | ---------------------------------- | -------------------------------------- |
| Backend          | Finish moves later          | Incomplete work at the status date | Extend its duration or end declaration |
| Frontend         | Start and finish move later | Linked to Backend                  | None; keep the dependency              |
| Release deadline | Date moves later            | Explicit date blocks the forecast  | Rewrite the date after review          |

## Source strategy to validate

- Preserve task aliases, order, completion statements, dependency declarations, calendars, and closed days.
- Change the delayed cause tasks and any explicit dates that block their forecast placement. Let relative dependency links move other successors and linked milestones; do not write fixed dates onto every shifted task.
- Preserve the original start of partially completed tasks. Adjust their duration or explicit end to cover the proposed finish.
- Show every fixed date that must be rewritten in the review. Apply may move it only after the editor reviews the exact old and new date.
- Keep the forecast enabled after applying, and show the new plan against the same status date so the result can be checked immediately.
- If a changed task has no reported `Complete`, show that the forecast assumed 0% before the editor confirms Apply. A selected past or future status date is labelled as a what-if based on current progress.
- Keep resource-capacity warnings separate. The current forecast does not level resources, so Apply does not claim to resolve resource conflicts.
- For a resource-adjusted duration, calculate the whole-day effort that produces the reviewed finish while preserving resource assignments. If the allocation makes that finish impossible, the review may round the plan up by one working day and show the revised finish before Apply. Larger gaps and incompatible dependencies block Apply with an explanation.

## Remaining-work stability

The default remaining-work estimate is calculated as a percentage of the _planned duration_. When Apply lengthens that duration, it saves the reviewed remaining-work estimate as an override for that task. This keeps the updated plan stable at the selected status date. Apply and Undo handle the source and estimate in one history step. The forecast labels these overrides as saved estimates.

## Acceptance examples

- A late Backend task extends its planned finish; Frontend and Testing move through their existing dependency links. Their source gains no fixed dates.
- A 50%-complete task keeps its original start, while its reviewed new finish is written into the plan.
- An explicit deadline that the forecast misses is listed as a proposed source edit before Apply.
- A diamond dependency shows both binding causes without duplicating successor edits.
- Applying after the source or progress changed since opening the review requires recalculation.
- Undo restores the source plan in one step. If Apply also saves remaining-work estimates, Undo restores those in the same step.

## Decisions made

- Edit delayed causes and preserve relative dependency links. Successors move through those links without new fixed-date declarations.
- Move explicit dates when necessary, with each old and new date shown in the review before Apply.
- Save the reviewed remaining-work estimate for a task whose duration changes, and restore it with Undo.
