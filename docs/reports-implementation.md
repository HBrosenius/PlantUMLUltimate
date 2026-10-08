# Task check-in reports

Open **More → Reports…**, search for **Reports…** in Commands, or choose **Create task check-in…** in Resources. Options are session-local except remembered message wording, and do not edit the diagram. The builder previews the dedicated email HTML that is copied or downloaded.

Choose a task preset and recipients, optionally exclude tasks, and review each recipient. The options use collapsible sections like the Task inspector. Introduction and sign-off edits are automatically remembered in this browser across documents and sessions; Restore default wording also updates the remembered values. Other report options remain session-local. Dates follow the browser's language/region (for example, Swedish `2026-10-08`) throughout the subject, body, and charts; date-only schedule values do not shift with the browser time zone.

Missing progress is “Not reported”; completion remains task-wide. Shared tasks appear in each assigned recipient's report. Combined summaries show the chosen audience and can include unassigned work. Name variants are grouped using the same trimmed, case-insensitive identity as workloads, with a warning to verify them.

Copy for email writes HTML and plain text together. Paste normally into a rich-text email body and copy the subject separately. Clipboard failure offers plain text, a standalone HTML download, and manual selection. “Copied” indicates a successful clipboard write, never delivery. Changes to options invalidate that message version; source or time-zone changes require Refresh report before exporting.

Optional charts use resolved dates from the complete schedule, then select only the report's tasks. A dedicated deterministic SVG timeline avoids recalculating an isolated PlantUML subset. It is rasterized locally at twice display resolution, in panels of up to 24 tasks sharing a time scale. Calendar closures and task pauses are visible as gaps; unknown progress uses dashed outlines. Limits are 240 scheduled tasks and a 10,000-day span. Unresolved rows remain in text and are listed in the chart caption. Charts have no dependency arrows; their caption explains that outside dependencies contribute to dates.

HTML downloads embed PNG data URLs and need no remote assets. Email editors may strip inline images even after a successful clipboard write. Use the separate Copy chart or Download chart PNG actions to insert each panel, or explicitly Continue without chart. Task summaries remain complete without images.

## Validation and compatibility

Automated checks cover schedule/filter boundaries, relative today anchoring, unresolved dates, shared assignments, recipient isolation, HTML escaping, unsafe links, clipboard unavailability, copied-version invalidation and stale-source protection.

Actual composed/received email compatibility is **unverified** for Gmail web, Outlook web/new Outlook, classic Outlook on Windows, and Apple Mail. No test email has been sent. Before release, validate normal paste, separate PNG insertion, received rendering, reply/forward, narrow panes, dark mode and plain-text composition in authorized test accounts. HTML preview and clipboard API success do not establish email-client compatibility.
