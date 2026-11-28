# Sprites and icon libraries: spike (I7)

Status: spike done 2026-11-25. **I7a (raster sprite rendering) landed (section 9); I7b (rendering many icons fast) landed, see section 10: the WebKit slowness was a measurement artifact, not the render.** Input to slice I7 of the [includes and C4 plan](includes-c4-plan.md). Nothing from the icon libraries is bundled.

## 1. Findings

**Why sprites failed.** The engine (`@plantuml/core` 1.2026.6, TeaVM output) turns a raster sprite (grayscale `[WxH/16]`, `/8`, `/4`, and their `z` compressed forms) into an `<image>` the browser way: it creates a canvas, calls `getContext("2d").createImageData(w, h)`, fills the RGBA buffer, calls `putImageData`, then `canvas.toDataURL("image/png")` and writes the result into `<image href=...>`. The call site is in the engine's bitmap-to-SVG code, not in our code.

Our worker (`render/canonical.worker.ts`) has no DOM. It replaces `document.createElement("canvas")` with a stub whose `getContext()` returned only the text measurement context (`font`, `measureText`) and whose `toDataURL()` threw `Raster content is disabled in the local renderer`. So the engine failed one step earlier with `createImageData is not a function`; had that been present, `toDataURL` would have thrown next. That stub is the "check" the plan refers to. Nothing else in the worker, the frame or the sanitizer rejects raster content.

**What the check protected against.** No commit message or document says. The stub came with the worker in the "Fix security and stability" commit (b1a3766). The reasonable reading: the worker is not allowed a real canvas or image decoding (no DOM, no network, bounded memory), so every canvas feature that could load, decode or emit arbitrary pixels was refused. The text measurement path is the only canvas use that was needed then.

**Which sprite kinds fail.** Only the ones that go through that canvas path. SVG sprites are drawn as vector shapes by the engine and never touch a canvas. `<img:data:image/png;base64,...>` is decoded by the engine's own PNG reader and its original data URL is reused, so it never touched the canvas either. See the table.

**A separate finding: font atlas cost in WebKit.** Before each render the app measures every distinct "word" of the source in WebKit and Firefox (Chromium measures natively). A sprite body is one 48-character "word" per pixel row, so one inline icon is about 40 extra words times 84 fonts. Twenty icons made WebKit take about 22 s per render. Sprite data is never drawn as text, so `buildFontAtlas` now ignores it (`withoutSpriteData`). WebKit with 20 icons is then about 14.6 s; the rest is the engine (see section 6).

## 2. What works, before and after

Measured in the app (a C4 tab, which accepts any source), Chromium, Firefox and WebKit. "Before" was measured in Chromium with the original worker.

| Sprite kind                                                           | Before                                                | After                                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Grayscale `[8x8/16]`, `/8`, `/4`, used as `<$name>` in an element     | Fails: `createImageData is not a function`            | Works in all three browsers (`<image>` with a `data:image/png;base64` href)                                           |
| Compressed `z` sprite (`[64x64/16z]`, AWS style)                      | Fails, same error                                     | Works in all three                                                                                                    |
| `<color:red><$a*3></color>` (colour, scale), sprite in an arrow label | Fails                                                 | Works in all three                                                                                                    |
| C4 default Person sprite (`$defaultPersonSprite = "person"`)          | Fails (so B7 switched it off)                         | Works; the library text is now unchanged except for the RELATIVE_INCLUDE wrapper                                      |
| C4 `$sprite="name"` on any element, with an inline sprite             | Fails                                                 | Works                                                                                                                 |
| Inline SVG sprite, one line (`sprite $s <svg ...>...</svg>`)          | Works (vector)                                        | Works                                                                                                                 |
| Large multi-line SVG sprite (Archimate, 1.7 KB)                       | Fails in Chromium: `Maximum call stack size exceeded` | Same: fails in Chromium, works in Firefox and WebKit. An engine recursion limit, not related to canvas (section 9.4). |
| `<img:data:image/png;base64,...>`, inline or in a note                | Works                                                 | Works                                                                                                                 |
| `<img:https://...>`                                                   | No image, no request, no error                        | Same. Nothing is fetched (checked with request logging)                                                               |

Not tested: `<&iconic>` OpenIconic (bundled separately, unchanged), `listsprites`, `/8z` and `/4z`.

A harness note: typing a non-Gantt source into a Gantt tab fails with `Cannot read properties of undefined (reading '$jsException')`, before and after. It is the Gantt tab's render path, not the sprites; every probe above ran in a C4 tab.

## 3. The fix and why it is safe

`render/sprite-canvas.ts` (new, about 100 lines) gives the worker's canvas stub the three things the engine calls:

- `getContext().createImageData(w, h)` returns `{ width, height, data: Uint8ClampedArray }`;
- `putImageData(image)` keeps it;
- `toDataURL()` writes the pixels as a PNG (stored deflate blocks, CRC32 and Adler32 in plain JavaScript) and returns a `data:image/png;base64,...` URL.

Text measurement is untouched: the context is an object that inherits from the existing font atlas or native text context. This is the smallest fix that fits. Alternatives looked at:

- **OffscreenCanvas in the worker.** Has `createImageData`, but no synchronous `toDataURL` (only the async `convertToBlob`), and the engine's call is synchronous. Not usable. It would also make output depend on the browser's PNG encoder.
- **Rewriting sprites to SVG before rendering.** Needs a parser for the grayscale and `z` formats (a custom Huffman/base64 alphabet plus inflate), and changes the source the engine sees. More code, more risk, no benefit.
- **A general ImageData polyfill.** Same as the chosen fix with a wider surface. The stub implements only what the engine calls.

Why this keeps the security intent:

- **No new capability reaches the engine.** The stub does arithmetic on a buffer the engine filled itself. It reads no URL, decodes no image and has no drawing API, so a source cannot make it fetch or load anything. `<img:https://...>` still produces nothing and no request.
- **The sandbox is unchanged.** The renderer frame's CSP (`default-src 'none'; connect-src 'none'; img-src data:`), the worker's blob-only script loading, and the include blocking are not touched. The output is a `data:` URL, which `img-src data:` already allows. The preview HTML passes through DOMPurify (`sanitizeSvg`), which keeps `data:` hrefs on `<image>`; checked in all three browsers.
- **Bounded.** The bitmap is limited to 512 x 512 pixels (1 MiB of pixels); real sprites are 16 to 64 pixels square. Sizes are checked as integers before any allocation. Larger sprites fail the render with a message, as before.
- **No fetch at runtime**, no new dependency.

What does not change: `<img:...>` with a remote URL is still never loaded.

Other changes in the PoC: the person sprite override is removed from `include-library.ts`, with the C4 README and help text updated; `font-atlas.ts` skips sprite data.

## 4. Icon libraries (assessed, not bundled)

Sources read: `tupadr3/plantuml-icon-font-sprites` (default branch `main`) and `plantuml/plantuml-stdlib` (master), downloaded to a temporary folder outside the repository. The stdlib copy is what `!include <tupadr3/...>` uses on the official server.

**Encoding.** Every tupadr3 icon is one `.puml` file with one uncompressed 4-bit grayscale sprite `sprite $name [48x48/16] { 48 rows of 48 hex digits }`, followed by macros. The macros come from `common.puml` (`ENTITY(...)`, `hide stereotype`), for example `FA5_USER(alias, label, shape, color)`. Some other stdlib sets (AWS, Azure) use `[64x64/16z]` compressed sprites; those work too (table above).

```
!include <tupadr3/common>
!include <tupadr3/font-awesome-5/user>
FA5_USER(u, "Customer")        ' or: rectangle "<$user> Customer"
```

**Size** (official stdlib copy, bytes on disk, `.puml` files only):

| Set                            | Icons | Total   | Average per icon |
| ------------------------------ | ----- | ------- | ---------------- |
| `font-awesome` (4)             | 786   | 2.25 MB | 2.9 KB           |
| `font-awesome-5`               | 1,457 | 4.18 MB | 2.9 KB           |
| `font-awesome-6` (stdlib only) | 1,881 | 5.43 MB | 2.9 KB           |
| `material`                     | 933   | 2.75 MB | 2.9 KB           |
| `devicons`                     | 191   | 0.54 MB | 2.9 KB           |
| `devicons2`                    | 965   | 2.84 MB | 2.9 KB           |
| `govicons`                     | 129   | 0.37 MB | 2.9 KB           |
| `weather`                      | 506   | 1.48 MB | 2.9 KB           |
| All of `tupadr3`               | 6,849 | 19.9 MB | 2.9 KB           |

Gzip compresses the hex rows well: one icon is about 0.5 KB gzipped, all of `font-awesome-5` about 460 KB, all of `tupadr3` about 2.1 MB. `common.puml` is 1.1 KB. Note that the tupadr3 repository itself has about 45 MB on disk (it also holds generated PNGs and docs); only the `.puml` files are relevant.

**Licences** (checked in the upstream repositories named by tupadr3's own generator, `src/lib/fonts.js`, at the pinned tags):

| Part                                                   | Licence                                                                                                                                                  | Verified                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tupadr3/plantuml-icon-font-sprites` (sprites, macros) | MIT, Copyright (c) 2017 tupadr3                                                                                                                          | `LICENSE.md`, GitHub API                                                                    |
| Font Awesome 5 Free (5.15.3)                           | Icons CC BY 4.0; fonts SIL OFL 1.1; code MIT                                                                                                             | `LICENSE.txt` at tag 5.15.3                                                                 |
| Font Awesome 4 (`fa-4` branch)                         | SIL OFL 1.1 (font), MIT (CSS)                                                                                                                            | **Not re-verified**: the upstream branch files could not be fetched. Check before bundling. |
| Material Design Icons (google, 3.0.2)                  | Apache 2.0                                                                                                                                               | `LICENSE` at tag 3.0.2                                                                      |
| Devicon / `devicons2` (v2.12.0)                        | MIT (Copyright konpa)                                                                                                                                    | `LICENSE` at tag                                                                            |
| Devicons (`vorillaz`)                                  | MIT                                                                                                                                                      | README statement                                                                            |
| Gov Icons (`540co`, 1.5.1)                             | Icons SIL OFL 1.1; code MIT; docs CC BY 3.0                                                                                                              | `LICENSE.md` at tag                                                                         |
| Weather Icons (erikflowers)                            | Icons SIL OFL 1.1; code MIT; docs CC BY 3.0                                                                                                              | README                                                                                      |
| `plantuml-stdlib` repository                           | No licence file at the root; README carries an MIT badge. Per-library licences are not stated in the repo (`tupadr3/README.md` has an empty `license:`). | README, file listing                                                                        |

Attribution the app would need, if these are bundled:

- **Font Awesome 5 and 6 icons (CC BY 4.0)** require credit, a link to the licence and an indication of changes. A line in the app's third-party notices plus the licence link is enough ("Font Awesome Free by Fonticons, Inc., CC BY 4.0, converted to PlantUML sprites by tupadr3, MIT"). Converting to a 16-level grayscale bitmap counts as a change; say so.
- **Apache 2.0 (Material)** requires the licence text and the NOTICE where there is one; no credit line in diagrams.
- **MIT** sets require the copyright and licence text in the distribution.
- **SIL OFL 1.1 (Gov Icons, Weather Icons, FA 4)**: the OFL covers the font; whether it covers a bitmap derived from a glyph is arguable. Do not bundle these without a decision, or leave them out.
- A third-party notices file (does the repo have one? add `docs/third-party.md` or the app's About page) listing each bundled set, its licence and link. Each bundled set would also get a `README.md` in its stdlib folder like the C4 one, with source tag and date.
- A diagram that uses an icon contains no copy of the icon, only a reference, so the person's own diagrams need no attribution. The app's exports (SVG, PNG) embed the rendered icon; CC BY applies to the icon, not to the diagram, and the usual practice is not to put credit in exports. Confirm with the licence owner's guidance before launch.

The above is a technical reading, not legal advice.

## 5. Bundling proposal (per icon, on demand)

Today `include-library.ts` uses `import.meta.glob("./stdlib/C4/*.puml", { query: "?raw", import: "default" })`: each file is its own lazy chunk, loaded only when a diagram includes it.

For icons, one file per icon with that glob would make thousands of chunks and a huge manifest. Proposal:

1. **Pack per set, not per icon, at build time.** A script (like `scripts/update-c4-stdlib.mjs`) reads the upstream tag and writes, for each set, one JSON file per alphabetic bucket (about 16 buckets of about 90 icons per set, about 40 KB gzipped each) plus a small index (`name -> bucket`) of about 20 KB. `import.meta.glob("./stdlib/tupadr3/*.json")` then yields a few dozen lazy chunks.
2. **Store the sprite once.** Only the grayscale rows are needed; the 4 macro lines per icon follow one pattern and can be generated. The rows can be kept as `z` compressed sprites (PlantUML's own encoding, which the engine already reads) to cut 2.9 KB to about 0.5 KB per icon before gzip.
3. **Resolve `!include <tupadr3/font-awesome-5/user>`** through the index to the bucket, load it, and extract the one icon (as the expander does for C4 files). `<tupadr3/common>` is a single file. Includes keep blocked for anything not in the index.
4. **Autocomplete and a picker** can use the index alone (names only, a few hundred KB for everything, loaded lazily when the user types `<tupadr3/`).

Bundle impact: the main bundle stays unchanged (index and buckets load on demand). The total in the build output for `font-awesome-5` plus `material` plus `devicons2` would be about 1 to 1.5 MB of lazy chunks (gzipped, uncompressed rows) or about a third of that with `z` rows. A single diagram with 5 icons loads one bucket per set, about 40 KB gzipped. If size matters more, ship only Font Awesome 5 and Material first (the plan's choice) and add sets on demand.

## 6. Timings

Measured end to end in the app after the fix, warm worker (first render of the page excluded), five runs each, time from typing the source to the new diagram on screen, including the render debounce. Chromium measures text natively; WebKit builds the font atlas.

| Diagram                                                    | Chromium (ms)           | WebKit (ms)                                                   |
| ---------------------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| C4 Container, 3 persons, **with** person icons             | 957 to 985 (cold 2,222) | 1,285 to 1,911 (cold 3,244)                                   |
| Same, `HIDE_PERSON_SPRITE()` (no icons)                    | 947 to 967              | 1,281 to 1,805                                                |
| 20 inline Font Awesome 5 icons (local copy, not committed) | 3,313 to 3,712          | 14,613 to 24,445 before the atlas fix; 12,660 to 14,885 after |

So person icons cost nothing measurable. Twenty icons cost about 2.5 s more in Chromium, about 120 ms per 48 x 48 sprite in total (not profiled; the PNG writer is a small loop over 9 K pixels and is unlikely to be the main part). WebKit is much slower and not yet understood: skipping sprite data in the atlas saved about 8 s, but 20 icons still take about 14 s there. The cause is not established (not profiled): either the engine's own sprite work or the rest of the render being slower in WebKit.

**Correction (I7b, section 10):** these timings started the clock when the test began typing the source into the editor. In WebKit, Playwright's `insertText` of the 20-icon source (about 12 KB, 1,000 lines) takes 10 to 13 s by itself, so about 13 of the 14 s were the harness, not the render. Measured from the moment the app sees the edit, 20 icons take about 1.3 s in WebKit and 0.5 s in Chromium.

## 7. Open risks

- **WebKit and icon-heavy diagrams**: resolved in I7b (section 10). 20 icons render in about 1.3 s and 40 in about 1.9 s from the edit; the 14 s above was the test typing the source into the editor.
- **Chromium stack overflow on SVG sprites with long path data** (Archimate). Engine limit, section 9.4; tupadr3 does not use SVG sprites.
- **Firefox:** a CSS attribute selector `image[href^="data:image/png..."]` does not match the engine's `<image>` there (the element has both `xlink:href` and `href`, and `getAttribute("href")` works). The e2e test reads the attribute instead.
- **Licences:** Font Awesome 4 and the OFL sets are not settled (section 4). The `plantuml-stdlib` repository has no licence file.
- **Exports:** checked and tested in I7a (section 9.1).
- **Zoom quality:** a 48 x 48 bitmap scales up blurry when the preview is zoomed; the official server has the same limit.
- The PNG writer stored uncompressed data (a 48 x 48 sprite was about 12 KB of base64, twice per image in the SVG). Fixed in I7b: real deflate, about half the size.

## 8. Recommendation for I7: go

Sprites work now with a small, contained change that keeps the sandbox, CSP and no-network rule as they are. Go, with these slices:

1. **I7a. Land the PoC** (this branch): sprite canvas, restored C4 person icon, atlas change, tests. Review the security argument in section 3.
2. **I7b. WebKit performance for sprites** (done, section 10): profiled the 20 and 40 icon cases; the gate (20 icons under 5 s in WebKit) holds at about 1.3 s.
3. **I7c. Licence decisions and notices**: settle FA 4 and the OFL sets, add the third-party notices file and the About entry. No files bundled before this.
4. **I7d. Build script and index** (`scripts/update-tupadr3-stdlib.mjs`): packed buckets, `z` rows, index, tests that the recorded tag and licence agree (as for C4).
5. **I7e. Font Awesome 5 and Material first**, then the other sets one at a time (S each as planned); expander resolves `<tupadr3/...>`; completion of icon names; a help section.
6. **I7f. Cloud libraries** (AWS, Azure, Kubernetes) later; their licences differ (AWS icons are CC BY-ND 2.0 as stated in the stdlib files) and need their own review.

## 9. I7a landed

Branch `feat/sprites`: the spike commit plus the follow-up below. Scope: render raster sprites, restore the C4 person icon, prove the exports, write the security argument down. No icon library is bundled.

### 9.1 Exports

Every path the app offers keeps the engine's `<image href="data:image/png;base64,...">`, for a C4 person icon and for an inline grayscale sprite. `tests/e2e/sprites-exports.spec.ts` renders both in a C4 tab and, for each export, decodes the result and checks that each sprite's rectangle holds several grey levels (a missing or blank sprite has one): quick SVG, quick PNG, quick PDF (the JPEG inside it), the export dialog's SVG (its second sanitising pass), snapshot (HTML) (also opened from a `file:` URL with no request and no CSP violation), and copy image (Chromium only, as the clipboard test already is). A last test puts a remote `<img:https://...>` and a `data:image/svg+xml` image in the source and asserts that no export contains either and nothing is requested. `render/sprite-export-path.test.ts` checks the same through `sanitizeSvg`, `prepareExportSvg` and `sanitizeSnapshotSvg` with a PNG from the worker's own writer, and pins the renderer frame CSP. Nothing needed fixing. Reports, collaboration and the PWA do not render engine output, so there is nothing to export there.

### 9.2 Security review

Written down in [rendering.md](rendering.md#raster-sprites-and-the-worker-canvas): what the old stub protected against, why the pixel path keeps that, where each sanitiser and CSP stands. No test asserted the old "raster disabled" behaviour (the only dependants were the C4 library override, now removed, and the failing sprites), so none had to change. One gap is reported, not changed: the shared `sanitizeSvg` leaves non-PNG `<image>` hrefs alone (the engine never writes them, the page CSP blocks them, the snapshot sanitiser strips them). An allow-list there is a sanitiser change and was left for a decision.

### 9.3 Regression runs

Run on Chromium, Firefox and WebKit: `c4`, `includes`, `includes-git`, `theme-gallery`, `security`, `preview-render-notice`, `renderer-performance`, `portable-document`, `export-options`, `snapshot-export` and the two sprite specs. Results are in the I7a hand-off report.

### 9.4 The Archimate stack overflow

Not ours. A sprite that is a single `<path d="...">` fails in Chromium once the path has roughly 50 to 80 segments (40 segments render, 80 do not, with or without newlines; about 1 KB is enough), with `RangeError: Maximum call stack size exceeded`. Firefox fails later (400 segments: `InternalError: too much recursion`); WebKit did not fail up to 2.9 KB. Deeply nested groups (300 levels), many short paths and 13 KB of small shapes all render, so the depth is in the engine's path data handling, one recursion level per segment. Our code never looks at sprite bodies in the worker (`getBBox` is text only; the font atlas skips sprite rows and SVG markup; sanitising runs on the result, after the engine). A `<style>` or gradient sprite fails differently (`Cannot read properties of null (reading 'bBZ')`), also inside the engine. Decision: a known limit. Workaround for authors: simplify the path or split it into shorter paths. A real fix would be a newer engine, or rewriting such sprites before rendering (not worth it yet). It does not affect the tupadr3 icons (bitmaps) or C4.

### 9.5 Still open

Licence decisions (I7c), the sanitiser allow-list above and zoom blur. WebKit speed and the PNG size were closed in I7b (section 10).

## 10. I7b: rendering many icons fast

Branch `feat/icon-render-speed`. Scope: find where the time goes for icon-heavy diagrams, fix what is real, add a benchmark and a regression test. No icon data is bundled; the fixtures are synthetic.

### 10.1 How it was measured

`tests/e2e/sprites-performance.spec.ts` renders generated 48 x 48 grayscale `/16` sprites (`tests/e2e/sprite-fixtures.ts`: deterministic rings and bars that differ per icon, one in eight is `/8`, one in eight `z` compressed) in a component diagram (`<$iconN>` in a rectangle) and in a C4 container diagram (`$sprite=`), at 1, 20 and 40 distinct icons, warm (a one-icon diagram is rendered first, then each fixture twice with a changed title). `SPRITE_BENCH=1 npx playwright test sprites-performance --workers=1` prints a JSON line per run. The phases are `plantuml:preview:*` performance measures that the app now records itself (latest only, no source text): `edit-to-post` (debounce, include expansion, atlas), `source-plan`, `font-atlas`, `worker-total`, `worker-sprites`, `worker-boxes` (text `getBBox`), `worker-hop` (worker to page), `sanitize-incoming`, then DOM insertion and paint up to two animation frames after the images are present.

The clock starts when the app sees the edit, not when the test starts typing. That is the whole story of the earlier numbers:

| Step (WebKit, 20 icons)                                       | Time                         |
| ------------------------------------------------------------- | ---------------------------- |
| Playwright `keyboard.insertText` of the 12 KB source          | 10.5 s (probe), 12.9 s (run) |
| CodeMirror transaction for the same text, dispatched directly | 31 ms (paint 140 to 210 ms)  |
| Everything the app does from the edit to the painted diagram  | about 1.3 s                  |

One `beforeinput` event arrives and the editor equals the text 127 ms after `insertText` returns, so the 10 s is spent inside the WebKit driver, not in the app. Typing time grows with the source: about 40 s for 40 icons. Chromium needs about 3 s (10 s for 40 icons) and Firefox 0.1 s for the same insertion. Icons that come from `!include` are not in the editor at all.

### 10.2 Where the time goes (after, median of 2 to 3 warm runs, ms)

| Browser  | Fixture   | Icons | Edit to post (atlas) | Worker (sprites, boxes) | Hop | Sanitise | DOM and paint | Total |
| -------- | --------- | ----- | -------------------- | ----------------------- | --- | -------- | ------------- | ----- |
| WebKit   | component | 1     | 169 (76)             | 30 (3, 1)               | 27  | 2        | 133           | 362   |
| WebKit   | component | 20    | 544 (213)            | 502 (27, 0)             | 22  | 10       | 174           | 1,275 |
| WebKit   | component | 40    | 886 (265)            | 801 (48, 2)             | 13  | 15       | 203           | 1,894 |
| WebKit   | C4        | 20    | 615 (312)            | 1,666 (56, 1)           | 28  | 24       | 183           | 2,504 |
| Chromium | component | 20    | 80 (no atlas)        | 303 (20, 0)             | 3   | 7        | 60            | 460   |

- **The engine is most of the worker time**: about 24 ms per icon in WebKit and 15 ms in Chromium; the C4 library adds about 0.9 s. Sprite encoding is 5 to 6 % of the worker time, text boxes nothing.
- **Edit to post** is the render debounce, include expansion and, in WebKit and Firefox, the font atlas. The atlas cost is measuring the real labels (`Item 1` to `Item 20` in 84 fonts each), not sprite rows: scanning the source with and without the sprite rows differs by 12 ms in WebKit (77 against 65 ms, everything cached).
- **Sanitising** is 10 to 24 ms and **DOM and paint** 0.13 to 0.28 s in WebKit.

### 10.3 Candidates checked

| Candidate                                     | Measured                                                                           | Verdict                                 |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| PNG writer speed (`crc32`, `adler32`, base64) | 1.7 ms to encode 20 sprites, 9 to 11 ms with base64 (WebKit), 16 ms in Firefox     | Not a hot spot                          |
| PNG size (stored deflate)                     | 9.3 KB per sprite, SVG 596 KB for 20 icons (1,193 KB for 40)                       | Real, but not a time cost: fixed (10.4) |
| Caching identical sprites                     | The engine draws every use again; at 0.5 to 1.5 ms per sprite it is not measurable | Added (cheap, bounded)                  |
| Font atlas measuring sprite rows              | Already skipped; the rows cost 12 ms to scan                                       | Nothing to gain                         |
| DOMPurify on large `data:` hrefs              | 12 to 22 ms for 0.6 to 1.2 MB; 7 to 15 ms after the size fix                       | Not a hot spot. No sanitiser change.    |
| Repeated `getBBox`                            | 0.1 to 2 ms in total                                                               | Not a hot spot                          |
| Editor insertion                              | See 10.1: the harness                                                              | Not the app                             |

### 10.4 What changed

`render/sprite-canvas.ts` and the new `render/deflate.ts`:

- The PNG is written in the smallest exact colour type: grey when every pixel is opaque and has equal red, green and blue, grey with alpha when only the colour is grey (what the engine writes for a sprite: it varies alpha), RGBA otherwise. Each scanline uses the best of the five PNG filters, and the data is compressed with a small synchronous deflate (LZ77 with a hash chain, fixed Huffman code, wrapped as zlib with Adler-32). `CompressionStream` is asynchronous and the engine's canvas calls are not, so it could not be used.
- Identical bitmaps are encoded once: a bounded cache (256 entries, 8 MB, nothing over 256 KB per entry) of the pixels and the URL, compared in full on a hit.
- Result: the SVG for 20 icons goes from 596 KB to 284 KB (component) and 636 KB to 479 KB (C4, whose library text is the rest); for 40 icons 1,193 KB to 571 KB. Sprite encoding itself got a little slower (for 40 icons about 21 to 39 ms in Chromium; the filter and deflate pass) and sanitising a little faster (22 to 15 ms): end to end it is a wash within noise. The point is size: exports, snapshots, version history and the render cache hold half as much.

Why it is safe: the writer still only encodes pixels the engine computed in the buffer `createImageData` gave it. It decodes nothing, reads no URL, makes no request, keeps the 512 x 512 cap and the integer size checks, and the output is the same `data:image/png;base64,` URL as before, which the sanitiser, the CSP and every export path already accept. The sanitiser, CSP, sandbox, no-network rule and include blocking were not touched. Tests decode every colour type back to the exact RGBA input (a full inflate, unfilter and compare), check that identical input gives identical bytes, and check that the cache returns the right image and stays bounded; `deflate.test.ts` checks the compressor against Node's `inflateRawSync` for empty, tiny, random, long-run, window-wide and 258-length inputs.

### 10.5 Result: before and after

End to end from the app seeing the edit to the painted preview, warm, median of 2 runs (component 20 after: 3), milliseconds. Before is `origin/main` plus the timing marks; after adds the PNG change.

| Fixture   | Icons | Chromium before | Chromium after | Firefox before | Firefox after | WebKit before | WebKit after |
| --------- | ----- | --------------- | -------------- | -------------- | ------------- | ------------- | ------------ |
| component | 1     | 178             | 194            | 149            | 148           | 307           | 362          |
| component | 20    | 451             | 460            | 508            | 537           | 1,233         | 1,275        |
| component | 40    | 674             | 693            | 777            | 791           | 2,185         | 1,894        |
| C4        | 1     | 760             | 682            | 1,068          | 1,026         | 1,255         | 1,262        |
| C4        | 20    | 1,190           | 1,302          | 1,702          | 1,745         | 2,548         | 2,504        |
| C4        | 40    | 1,573           | 1,645          | 2,327          | 2,360         | 3,532         | 3,802        |

Rendered SVG size (KB, as the DOM serialises it): component 15 (1 icon), 284 (20), 571 (40), before 30, 596, 1,193; C4 24, 479, 957, before 31, 636, 1,271.

**Gate.** Twenty icons under 5 s warm in WebKit: met before and after, at about 1.3 s (component) and 2.5 s (C4, of which the C4 library is about 1 s). Chromium and Firefox are no slower than before (the differences are within the run-to-run spread of about 10 %). Forty icons: 1.9 s (component) and 3.8 s (C4) in WebKit, 0.7 and 1.6 s in Chromium, 0.8 and 2.4 s in Firefox. The 30 s render timeout is not near.

A regression test runs in every browser: `20 distinct icons render in a bounded time` fails if 20 icons take over 10 s from the edit or the SVG exceeds 450 KB.

### 10.6 What is left

- **I7c**: licence decisions and notices, unchanged.
- **I7d and I7e** (packed buckets, include resolution): the render path is ready for them. Plan for C4 plus 40 icons at about 3.8 s in WebKit, of which about 0.9 s is the C4 library and the engine takes about 24 ms per icon. Nothing in the app is worth changing before then; measure with `SPRITE_BENCH` once real icon sets are included.
- A diagram taller than about 4,000 px is refused by the size limit, which a chain of 40 icons hits; the fixtures are laid out in rows of five for that reason.
- Typing a very large source with Playwright's WebKit driver is slow (10 s per 12 KB). For large sources in e2e tests, dispatch through `EditorView` in `page.evaluate`.
- The sanitiser allow-list for `<image>` hrefs (section 9.2) is still open.

## 11. I7c: licence decisions

Decided 2026-11-28:

| Icon set                                                    | Licence                           | Decision     | What it requires                                                                            |
| ----------------------------------------------------------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| tupadr3 `plantuml-icon-font-sprites` (the PlantUML wrapper) | MIT                               | Bundle       | Keep its copyright notice                                                                   |
| Font Awesome 5                                              | CC BY 4.0                         | Bundle first | Credit Font Awesome, link the licence, and say the icons were converted to PlantUML sprites |
| Material Design icons                                       | Apache 2.0                        | Bundle first | Include the licence text and notice                                                         |
| Font Awesome 4, Devicon, Gov Icons, Weather Icons           | FA4 unconfirmed; MIT; SIL OFL 1.1 | Later        | FA4's licence must be confirmed first                                                       |
| AWS cloud icons                                             | CC BY-ND 2.0                      | Not bundled  | No modified versions; converting to sprites arguably is one                                 |

How credit is given:

- `THIRD_PARTY_NOTICES.md` at the repository root, with each source's copyright, licence, link and full licence text. It is generated by `node scripts/third-party-notices.mjs` from `apps/web/src/third-party-credits.json`, the bundled theme headers and each source's licence file, and a unit test fails when it is out of date. The same text is served as `third-party-notices.txt`.
- Help → **Credits and licences** lists every source with its licence and links to the full notices.
- I7e adds a credit next to the icon picker, and adds each icon set to `third-party-credits.json` (with its licence file) when it is bundled, then regenerates the notices.

The notices already cover what was bundled before I7: the engine (`@plantuml/core`, MIT), C4-PlantUML (MIT) and the 44 PlantUML themes. 31 themes are MIT, 3 Apache 2.0, one (`sunlust`) GPL 3+, and 9 declare no licence of their own (they come from the PlantUML project). The GPL theme was flagged for the owner's review.
