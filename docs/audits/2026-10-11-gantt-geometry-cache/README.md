# Gantt geometry reuse — 2026-10-11

Implemented the first delivery from [large-document next steps](../../large-document-next-steps-2026-10-11.md). Original SVG rectangle, polygon and path bounds are cached on first use within each overlay invocation, including unavailable bounds. Task matching, aggregate hitboxes and partial-progress clipping reuse those bounds. Shape order, eligibility, date disambiguation and row-height predicates are preserved. No geometry is shared between renders.

## Validation

- Canonical overlay unit tests: 19 passed.
- Chromium browser checks: four passed (hand-drawn dependencies, keyboard move/resize/reorder, fixed/relative milestones, and keyword typo repair). Progress clipping is covered by the unit suite; the keyword test is not progress visual coverage.
- Focused ESLint, Prettier and production TypeScript/Vite build passed.
- Production Chromium: unchanged 50/200-task workloads each passed five title edits, Outline search and native save/reopen source checks. No page errors were recorded. [Raw results](results.json).

| Workload  | Earlier audit edit median | Current edit median | Current initial load |
| --------- | ------------------------: | ------------------: | -------------------: |
| 50 tasks  |                   1.313 s |             1.207 s |              1.226 s |
| 200 tasks |                   3.599 s |             3.052 s |              3.492 s |

The observed 200-task edit median is approximately 15% lower. These are separate runs on the same desktop, not an interleaved controlled A/B experiment; host load and engine variation can affect the difference. This does not establish that the cache alone accounts for that percentage. The current 200-task initial render still has a 1,128 ms main-thread task (earlier: 1,173 ms), so responsiveness is not solved.

Reproduce with a production preview on port 4175:

```powershell
$env:LARGE_DOCUMENT_FILTER='^gantt-(50|200)$'
$env:LARGE_DOCUMENT_OUTPUT='test-results/gantt-geometry-cache'
node benchmarks/large-documents.mjs chromium
```

The actual run used port 4181, configured through `LARGE_DOCUMENT_ORIGIN`. The preview was stopped afterward. The initial sandboxed unit-test invocation failed in Vite file resolution before tests ran; the permitted retry passed. No deployment or full release certification was performed.

Next: profile the remaining main-thread work and compare SVG parsing/insertion with cached matching before deciding whether a row index is justified. Oversized-preview guidance and large-document navigation remain separate planned deliveries. WebKit validation from the original audit remains inconclusive.
