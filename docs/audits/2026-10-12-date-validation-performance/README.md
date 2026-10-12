# Date validation during editing, 2026-10-12

Baseline: `4049a78`. A fresh Chromium production profile of two title edits and two Undo operations in a 200-diagram project attributed 135.08 ms of sampled self time to `validIsoDate`. The validator previously constructed a Date and serialized it for every check.

The validator now checks strict ISO formatting, month bounds, Gregorian leap years and day bounds using arithmetic. There is no cache or change to calendar limits. Date shifting still uses UTC Date arithmetic and validates its result.

Tests compare the replacement to the previous implementation for all 184,800 combinations of years 0000–0399, months 00–13 and days 00–32. This covers a complete Gregorian leap-year cycle and invalid month/day values. Separate tests cover formatting, century exceptions, year 9999, shifting beyond the four-digit year range, invalid dates and unsafe shift amounts.

## Evidence

Sampled self time attributed to date validation fell from 135.08 ms to 6.73 ms (about 95%). This is a local CPU reduction, not a 95% improvement in editing responsiveness. Complete profiled phase time was 3.58 s before and 3.65 s after. The two edit observations were 1.16/0.79 s before and 1.12/0.81 s after. These timings do not establish an end-to-end speedup. Separate runs, warm-up, sampling and concurrent host work affect measurements; full validation was running during the optimized profile.

Both profiles used production builds with source maps and the existing `LARGE_DOCUMENT_PROFILE=1` benchmark flag. The source-map summaries use the installed trace-mapping package. Raw profiles and source-mapped summaries are retained alongside the workload results. SVG parsing/sanitization remains a substantial cost and was not changed.

The profiled baseline and optimized workloads both passed edit/Undo and save/reopen checks, preserving 1,000 original revision contents and metadata and all 100 original links. See `baseline.json` and `profiled-optimized.json`.

## Reproduce

Build with `npm --workspace @plantuml-studio/web exec -- vite build --sourcemap`, serve production preview on port 4175, and run `node benchmarks/large-documents.mjs chromium` with `LARGE_DOCUMENT_RUNS=1`, `LARGE_DOCUMENT_FILTER=^document-200$` and `LARGE_DOCUMENT_PROFILE=1`. Use a separate output directory for each build. Run without profiling for normal cross-browser checks.

Full `npm run validate` passed: lint, format checks, 2,317 unit tests, nine collaboration tests, 13 integration tests, all workspace type checks, the production application build and both worker dry-run builds.

All six unprofiled 50/200-diagram workloads passed in Chromium, Firefox and WebKit; see `final.json`. They exercise source edits, Undo, navigation, link selection/creation/removal and save/reopen with original source, link and revision-integrity checks.
