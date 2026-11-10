# Course practice assets

These are fictional, versioned course assets. Project dates are fixed; no real customer data, external integration bindings, or credentials are included.

## Lesson 02

Open `lesson-02/02-start.pumlu` through **File → Open → Document**, then choose **02-start** in the Document navigator. Use a disposable practice copy. The `.puml` files contain the same diagram source without the portable document container.

| File stem | When to use it |
|---|---|
| `02-start` | Begin or restart the lesson. |
| `02-visual-edit` | Resume after setting Design to 7 working days. |
| `02-source-edit` | Resume after setting Build to 10 days. |
| `02-demonstration-final` | Inspect the instructor's final example: Design 7, Build 10, Build progress 25%. |
| `02-exercise-answer` | Check the learner exercise: Design 6, Build 10, Build progress 25%. |

Each stem has both `.pumlu` and `.puml` versions. Reopening a different checkpoint starts from that file's state; the supplied files do not pretend to contain a history of edits made by the learner. Each has one initial checkpoint and independent document identity.

## Customer-portal reference

`customer-portal/customer-portal-reference.pumlu` contains seven named diagrams: Launch plan, Scope, Submit request, Capabilities, Domain, Architecture, and Intake workflow. Each also has an individual `portal-*.puml` source file.

This is the foundational reference, not the answer to every later lesson. Diagrams start unlinked. Resource assignments, deliberate overloads, forecasts, reporting observations, connected WBS–Gantt work, and sandbox Jira bindings will be added in their relevant lesson checkpoints. Creating links is part of the course rather than hidden setup.

The Gantt diagram starts on 2 November 2026, closes weekends, and avoids a moving Today marker. Names, aliases, and dates are stable so demonstrations can be repeated.

## Validation

Six portable artifacts were generated with the application's document-format library and decoded again to verify exact payload round trips. The lesson start opened in the app and passed the nine-step editing rehearsal. All seven diagrams in the reference document matched their source and rendered their expected titles. Detailed reports are in `output/training-pilot/`.
