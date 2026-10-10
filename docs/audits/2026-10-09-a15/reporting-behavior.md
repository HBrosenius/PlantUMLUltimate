# A15 — Reports before assignment

- Reports opens as the chosen check-in type; empty results do not switch types automatically.
- Coordinator summary explicitly selects all tasks, people, milestones, unresolved schedules, and unassigned work, and clears individual exclusions.
- Delivery outlook explicitly selects the existing milestone/delivery report with the same audience scope.
- Workload offers Open task assignment and a direct coordinator summary when tasks have no people.
- Empty preview explains missing assignments, date/progress/content scope, individual exclusions, or audience selection. Counts show plan tasks, candidates, included tasks, assignments, and unassigned tasks.
- Wording and individual exclusions start collapsed. Scope and preview remain visible.
- Repeated document/diagram names appear once in the report breadcrumb.
- Reports still build from the captured source and their own options, independently of canvas filters. Presets never mutate source or assign people.
- Forecast, history, due-date, critical path, baseline, and scenario behavior remain available.

Validation: focused report/workload unit suite, production build with TypeScript, changed-file lint/format checks, and Chromium/Firefox/WebKit report journeys. Screenshots cover desktop and a 390 × 844 browser viewport; real mobile keyboards are outside this check.
