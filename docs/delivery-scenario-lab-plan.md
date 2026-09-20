# Delivery Scenario Lab: first slice

## User promise

Try a delivery-plan change without mutating the current plan, understand why the result changed, and promote the chosen scenario through a reviewable PlantUML patch.

## Preconditions

Start implementation only after the release gate passes and the project-review pilot has produced evidence that review and impact labels are understood. Scenario comparison depends on those trust boundaries.

## First slice

Support exactly two named states for one Gantt document:

- **Current plan** — an immutable source snapshot captured when the lab opens.
- **Scenario** — a working source derived from that snapshot.

Allow changes to task duration, explicit task dates, dependencies, resource assignments, and calendar exceptions through existing source-preserving operations. Recompute deterministic dates, milestone movement, resource overloads, and the critical path after every valid change.

Show a comparison containing:

- moved milestones and their day deltas;
- changed task dates and durations;
- added or removed dependencies;
- new and resolved resource conflicts;
- a cause trace from each moved milestone to changed inputs;
- linked project items as items to review, never as automatic schedule dependencies.

Promotion must create a semantic/source review against the current document. The user accepts the patch through the existing commit and undo path. Closing the lab without promotion leaves the document unchanged.

## Architecture boundaries

- PlantUML source remains authoritative.
- Scenario state is session-local in the first slice; do not extend the portable project schema yet.
- Reuse scheduling and calendar calculations rather than introducing a second scheduling engine.
- Reuse semantic review groups for the promotion preview.
- Distinguish calculated facts from user assumptions and project-link suggestions.
- Reject or clearly classify unsupported syntax; never silently normalize unrelated source.

## Implementation sequence

1. Extract a pure scenario comparison model from existing resolved-date, workload, calendar, and semantic-review functions.
2. Add fixtures for milestone movement, dependency changes, calendar exceptions, overload changes, cycles, unresolved dates, and unsupported source.
3. Add a dialog with current/scenario columns and one selected-change inspector.
4. Add cause traces and project-link context.
5. Add promotion through semantic review and the normal undo history.
6. Cover open, edit, compare, cancel, promote, undo, save, and reopen in one browser journey.

## Exit gate

- Reopening the same inputs produces the same comparison.
- Cancel never changes document source or history.
- Promotion changes only reviewed source ranges and is undoable in one operation.
- Every displayed milestone delta has a trace to changed inputs.
- Project links are labelled as review context, not causal schedule facts.
- Invalid or unsupported changes fail with an actionable explanation.

## Explicitly deferred

Multiple scenario branches, probability simulation, Monte Carlo forecasts, Jira publication, shared scenarios, portable scenario persistence, automatic architecture-to-schedule dependency creation, and AI-generated assumptions.
