# Project review pilot

## Decision this pilot must support

Determine whether project-wide change review helps developers and technical leads understand a real PlantUML change faster and with fewer missed impacts than their current workflow.

Do not use prepared success-path demos as evidence. Each participant must bring a real or recently completed diagram change.

## Participants

Recruit 5–8 people who maintain PlantUML in Git:

- at least three frequent PlantUML contributors;
- at least two reviewers or technical leads;
- a mix of single-diagram and multi-diagram repositories;
- no requirement for an account, Jira connection, or collaboration session.

Record prior familiarity with PlantUML, repository size, diagram families used, and current review method. Do not collect source files or document contents without explicit consent.

## Session protocol

Run a 45-minute moderated session:

1. Ask the participant to explain a recent diagram change and how they reviewed it.
2. Establish the saved project baseline, make or import a representative change, and ask the participant to review it without coaching.
3. Ask them to identify changed diagrams, semantic changes, unresolved source changes, and linked items that may need attention.
4. Ask them to export the review report and explain the change from that report alone.
5. Repeat the core explanation task using their normal diff/review workflow when practical. Counterbalance the order across participants.
6. End with a short interview about trust, missing evidence, confusing labels, and whether they would use the workflow again.

The facilitator may resolve setup failures but must record them separately from task errors.

## Measures

Capture:

- time to a correct explanation of the change;
- changed diagrams and impacts found versus known ground truth;
- false impacts reported as certain;
- assistance requests and setup failures;
- whether unsupported or unresolved changes were interpreted correctly;
- confidence before and after reviewing;
- whether the participant would use the workflow on another real change.

Keep qualitative notes tied to observable behavior. Feature requests are inputs, not proof of value.

## Success gate

Proceed to broaden project review only if:

- at least five sessions complete with real changes;
- at least three participants voluntarily agree to use it again;
- the median participant reaches a correct explanation faster than with their current workflow, where a comparison is available;
- no participant mistakes an unresolved or inferred impact for a confirmed fact because of the UI;
- no data-loss, baseline, export, or privacy failure remains open.

Otherwise, fix the dominant trust or setup problem and repeat the affected sessions before expanding scope.

## Session record

For each participant record an anonymous ID, date, diagram families, project size, task outcome, timings, missed or false impacts, setup failures, notable quotes paraphrased with consent, and the follow-up decision. Keep repository names and document contents out of the record by default.
