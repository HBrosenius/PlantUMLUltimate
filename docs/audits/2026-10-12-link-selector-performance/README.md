# Large link selector performance, 2026-10-12

Follow-up to the [history restoration improvement](../2026-10-12-document-open-performance/README.md), committed as `603fe47`.

## Investigation

A temporary production build limited the source selector to one item, without changing registration or history restoration. WebKit's 200-diagram opening fell from the preceding 17.79-second median to 5.51 seconds. That build was diagnostic only: it deliberately removed access to most options. The source was restored immediately after building. Its [report](diagnostic.json) records preservation checks, but does not establish a usable link workflow.

## Implementation

Link selectors now display 100 items per page when the full list exceeds 100 items. Search matches diagram paths, item names and resolution labels across the entire list. Previous/Next controls provide access even when many items share the same label. A selected item stays mounted when search or paging moves away from it. Smaller lists retain the original select workflow. Compatibility rules, link identities and persistence are unchanged.

Each select mounts at most 102 options: 100 page items, the placeholder and an optional selected item outside the page. This bounds native option layout while retaining access to every item. Existing links remain visible separately.

## Results and verification

Production opening observations for 200 diagrams:

| Browser  | First run | Repeat |
| -------- | --------- | ------ |
| Chromium | 2.52 s    | -      |
| Firefox  | 12.56 s   | 4.37 s |
| WebKit   | 5.88 s    | 6.07 s |

The Firefox first run overlapped the unit suite and is retained as a correctness result, not a useful performance comparison. The repeat began after that suite finished. These are separate generated fixtures on the same desktop, not a randomized or byte-identical A/B experiment. Browser and host load affect timing. WebKit's two observations are about 66% below the preceding 17.79-second median; opening still takes several seconds.

All six 50/200-diagram workloads passed across Chromium, Firefox and WebKit, plus the repeated Firefox/WebKit 200-diagram workloads. Each exercised paging, searching for late source and target items, creating/removing a WBS link, retaining a selection after clearing search, diagram search/switching, and save/reopen. All original sources, 250/1,000 history versions and 24/100 links survived. No page errors were recorded. See [all browsers](all-browsers.json) and [repeat](repeat.json).

Lint, formatting, all 2,311 unit tests, web type checks and the production web build passed. Selector tests cover access to the last page, search, selection retention, empty results, shrinking compatible lists and disabled/small-list behavior. The existing WBS link browser regression was also run in Chromium and WebKit.

Reproduce using the commands in the preceding audit. The benchmark now checks the large-selector workflow automatically for portable-document cases. Keep performance reports before Playwright runs, which clear their output directory. Generated stress fixtures and in-memory file handles have the same limits as the preceding audit; no native filesystem or mobile-device claims are made.
