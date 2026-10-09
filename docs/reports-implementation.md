# Task check-in reports

## Expanded report catalogue

The Reports chooser also provides Critical path and schedule sensitivity, Progress and due-date outlook, Milestone and delivery outlook, Historical burndown/burnup, Changes since baseline, and Resource workload and assignment coverage. All reuse the email HTML/plain-text export, standalone HTML, optional PNG charts, recipient filters, and stale-preview protection. Baseline, capacity, and observation changes also require Refresh report. Report IDs appear in both exports.

Progress outlook uses equal task weights (task equivalents), excludes milestones, and shows known remaining plus an unknown range. Due-date distributions and the planned finish-date staircase are distinct from actual observations. Unscheduled tasks remain in remaining-work totals but are excluded from the dated reference, with coverage disclosed. Duration weighting is not offered.

Critical path analyzes the complete project before audience filtering. Slack uses task working days, or calendar days for milestones, under the existing calendar/pauses rules. Unsupported relations, cycles, and unresolved dates make the calculation unavailable. The report shows critical and near-critical tasks (default threshold 2 days), latest allowable dates, and at most 20 representative chains; outside-scope tasks have anonymous placeholders. It is a planned dependency analysis; resource contention and progress forecasting are separate calculations.

Milestones require explicit recorded completion for achievement. Forecast dates are unavailable in this report. Baseline comparisons use the selected named History baseline and stable aliases; unaliased task matches are flagged as uncertain. Date/completion/name/assignment/dependency changes and selected-scope removals are disclosed without attributing causes. Workload uses existing per-resource allocation calculations, configured/default capacity, and the working calendar; completion does not reduce scheduled load.

### Explicit progress history

Choose **Record progress snapshot** to capture the full diagram, source SHA-256, time zone, capture timestamp, and effective reporting date. Every task/milestone requires a unique explicit alias; preserve aliases when renaming. Preview and exports never record observations. Save as a portable `.pumlu` document/project to carry observations between devices; plain PlantUML source files cannot carry document metadata.

Observations have their own versioned metadata and are all pinned, independently of undo/source-history retention. The limit is 100 observations or 16 MiB of captured source; reaching either limit preserves existing history and refuses new captures. There is no automatic eviction or retained-version reconstruction. Captured sources preserve calendar, assignments, dependencies, planned dates and unknown progress; task-equivalent weights stay fixed at 1. History requires at least two comparable explicit observations.

Fixed baseline scope (default) retains baseline task/people membership. Removed members contribute unknown progress, never fabricated completion; additions appear as events outside baseline totals. Dynamic scope uses each observation's selected audience and records membership changes. Both views disclose progress corrections, renames, schedule re-estimation and reassignment. A later baseline selection starts a labeled reference segment and preserves earlier observations. Effective dates different from capture dates are labeled. Step charts show last recorded values across gaps, with completed/scope burnup lines, remaining burndown, uncertainty bands and frozen baseline reference; the equivalent values appear in text and HTML.

Reporting metadata is optional in document schema 1; old documents open without history. Observation payloads have version 1, strict validation, unique IDs, retention bounds and checked source fingerprints on encode/decode, including embedded projects. Metadata stays inside the existing compressed/encrypted envelope and follows the existing encrypted recovery policy. Older application builds that reject the new optional field need an updated application to open files with observations; keep a copy before using older builds. No unencrypted sidecar is created.

The roadmap's optional portfolio, automated delivery, cost, response tracking, scenario, WBS, saved-pack, and other advanced reports remain gated on their additional data/workflows. No sending or scheduling is added.

Open **More → Reports…**, search for **Reports…** in Commands, or choose **Create task check-in…** in Resources. Options are session-local except remembered message wording, and do not edit the diagram. The builder previews the dedicated email HTML that is copied or downloaded.

Choose a task preset and recipients, optionally exclude tasks, and review each recipient. The options use collapsible sections like the Task inspector. Introduction and sign-off edits are automatically remembered in this browser across documents and sessions; Restore default wording also updates the remembered values. Other report options remain session-local. Dates follow the browser's language/region (for example, Swedish `2026-10-08`) throughout the subject, body, and charts; date-only schedule values do not shift with the browser time zone.

Missing progress is “Not reported”; completion remains task-wide. Shared tasks appear in each assigned recipient's report. Combined summaries show the chosen audience and can include unassigned work. Name variants are grouped using the same trimmed, case-insensitive identity as workloads, with a warning to verify them.

Copy for email writes HTML and plain text together. Paste normally into a rich-text email body and copy the subject separately. Clipboard failure offers plain text, a standalone HTML download, and manual selection. “Copied” indicates a successful clipboard write, never delivery. Changes to options invalidate that message version; source or time-zone changes require Refresh report before exporting.

Optional charts use resolved dates from the complete schedule, then select only the report's tasks. A dedicated deterministic SVG timeline avoids recalculating an isolated PlantUML subset. It is rasterized locally at twice display resolution, in panels of up to 24 tasks sharing a time scale. Calendar closures and task pauses are visible as gaps; unknown progress uses dashed outlines. Limits are 240 scheduled tasks and a 10,000-day span. Unresolved rows remain in text and are listed in the chart caption. Charts have no dependency arrows; their caption explains that outside dependencies contribute to dates.

HTML downloads embed PNG data URLs and need no remote assets. Email editors may strip inline images even after a successful clipboard write. Use the separate Copy chart or Download chart PNG actions to insert each panel, or explicitly Continue without chart. Task summaries remain complete without images.

## Validation and compatibility

Automated checks cover schedule/filter boundaries, relative today anchoring, unresolved dates, shared assignments, recipient isolation, HTML escaping, unsafe links, clipboard unavailability, copied-version invalidation and stale-source protection.

Actual composed/received email compatibility is **unverified** for Gmail web, Outlook web/new Outlook, classic Outlook on Windows, and Apple Mail. No test email has been sent. Before release, validate normal paste, separate PNG insertion, received rendering, reply/forward, narrow panes, dark mode and plain-text composition in authorized test accounts. HTML preview and clipboard API success do not establish email-client compatibility.

# Forecast report

Select **Progress forecast** under Delivery. The report reuses `calculateProgressForecast`, finish-cause tracing, and the resource-conflict comparison from the Forecast view. It reads the document's saved remaining-work estimates and defaults to its saved status date (or today in its time zone, UTC when unset). Changing the report date creates a scenario without editing the document.

Project finish dates are calculated from the full dependency graph before audience filtering. Exported task details show planned and projected dates, remaining work and estimate provenance, delay, missing-progress assumptions, and drivers within the selected scope. Outside-scope task names are omitted. Resource contention is reported, not used to reschedule work. Unavailable tasks are identified and a partial project forecast is explicitly labelled.

The optional chart compares planned bars with projected bars and milestone markers. It uses the existing local PNG export, email copy, and HTML download workflow. Dates follow the browser locale.
