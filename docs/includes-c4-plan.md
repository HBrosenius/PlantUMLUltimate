# B7: Includes and C4 diagrams — plan

Status: decided 2026-11-24 (see [section 7](#7-decisions)). I0 to I4 and I7a are implemented (see [section 10](#10-progress-and-notes)); I5, I6 and the rest of I7 are not started. Builds on [rendering](rendering.md), the bundled themes (`apps/web/src/render/bundled-themes.ts`), [single-file documents](single-file-projects.md) and the [GitHub](git-integration-plan.md) and [GitLab](gitlab-integration-plan.md) integrations.

## 0. Why

Two things that are very common in real PlantUML don't work in the app today:

1. **C4 diagrams.** C4-PlantUML is one of the most used ways to draw software architecture in PlantUML. Every C4 file starts with an include:

   ```plantuml
   @startuml
   !include <C4/C4_Container>
   Person(user, "Customer")
   System_Boundary(shop, "Web shop") {
     Container(web, "Web app", "React")
     ContainerDb(db, "Database", "PostgreSQL")
   }
   Rel(user, web, "Uses", "HTTPS")
   Rel(web, db, "Reads and writes")
   @enduml
   ```

2. **Shared files.** Teams keep common styles, skin parameters and procedures in one file and include it everywhere: `!include ../common/style.puml`.

The renderer replaces **every** include with a "blocked" comment (`render/plantuml-source.ts`, `RESOURCE_DIRECTIVE`). That is deliberate: the engine runs in a sandbox with no network and no file access, so nothing leaves the device. But the bundled `@plantuml/core` build has no copy of PlantUML's standard library, so `<C4/...>` has nothing to read either. The result: a C4 file renders as a list of unknown functions, and a file with a shared style renders without it.

This also undercuts the Git integration: many repositories that someone opens from GitHub or GitLab will look broken.

I found no editor that renders C4-PlantUML in the browser while offline; the usual offline route is the Java JAR. Doing it locally, with no server, fits the app's local-first promise.

**Goal:** C4 and include-based diagrams render exactly as PlantUML renders them, still with nothing sent anywhere, and with errors pointing at the right file and line.

## 1. What exists to build on

- **Bundled themes:** `!theme <name>` is already expanded locally before rendering. The 44 official themes (~390 KB) are loaded on demand with `import.meta.glob(..., { query: "?raw" })` and inlined by `expandBundledTheme`. Includes can work the same way.
- **The render pipeline** (`render/use-renderer.ts`): source → `sourceForPlantUmlRenderer` → sandboxed worker. Preparing a theme is already an async step before queueing.
- **Multi-diagram `.pumlu` documents:** every diagram has a name, so one diagram can include another by name.
- **Git origins** (`features/git/git-origin.ts`): provider, server, project, ref and path, and the provider clients can read any file in the repository with the user's own token.
- **Syntax errors** are mapped to a line (`render/syntax-error.ts`).
- **Diagram detection** (`diagram-kind.ts`): C4 sources match no keyword today, so they get no diagram kind.

## 2. How includes will work

The rule stays: **the engine never reads files or the network.** Instead, the app expands includes into the source **before** it reaches the sandbox, using only text it already has or has explicitly been allowed to read.

### 2.1 Where included text can come from

| Include                                                                                          | Resolved from                                                                                        | Network                                   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `!include <C4/C4_Container>` (standard library)                                                  | A copy bundled with the app, loaded on demand like themes                                            | None                                      |
| `!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/<ref>/C4_Container.puml` | The same bundled copy. These well-known C4 links are common in the wild and are mapped, not fetched. | None                                      |
| `!include style.puml` in a `.pumlu` document                                                     | Another diagram in the same document with that name                                                  | None                                      |
| `!include ../common/style.puml` in a file opened from GitHub or GitLab                           | The same repository, at the same branch, read with the user's token                                  | Only to the user's own Git host, as today |
| `!include` in a file opened from a local folder                                                  | The same folder, through the existing folder access                                                  | None                                      |
| Any other URL (`!includeurl`, `http…`), `%load_json`, `%getenv`, …                               | Still blocked, with a clear message                                                                  | None                                      |

### 2.2 The expander

A new module `render/includes.ts`, run before `sourceForPlantUmlRenderer`'s other steps:

- Follows PlantUML's own preprocessor rules for the include forms: `!include`, `!include_once`, `!include_many`, `!includesub file!NAME` with `!startsub`/`!endsub`, and `!include file!N` (the Nth `@start…` block). Only the body between `@start…` and `@end…` of an included file is inlined.
- Recurses: C4 files include each other (`C4_Container` → `C4_Context` → `C4`).
- Limits: depth 16, 2 MB of expanded text, and cycle detection. A cycle or an exceeded limit is a clear error, not a hang.
- Async like themes: a `prepareIncludes(source, context)` step loads what is missing (bundled library parts, Git files), then the synchronous expansion runs. Results are cached per document and invalidated when an included diagram changes.
- **Line map:** the expanded source carries a map from each line back to its file and line. Syntax errors then say "`common/style.puml`, line 4" instead of a wrong line in the open diagram. Theme expansion moves onto the same mechanism, which also fixes line numbers after an expanded `!theme`.

### 2.3 What the user sees

- **Status bar / diagnostics:** "2 includes" with a list: where each came from (library, this document, repository) and whether it loaded.
- **Missing include:** a diagnostic on the `!include` line: "`style.puml` isn't in this document." It offers quick fixes: add it as a new diagram, or open the file from the repository or folder.
- **Blocked include:** "This include reads from the internet, which PlantUML Ultimate never does." Where a bundled copy exists (C4 links), the include works and a note says it came from the bundled copy.
- **Ctrl/Cmd-click on an include** opens the included diagram or file.

## 3. C4 in the app

Rendering is the first win. On top of it:

- **Detection:** a source that includes a C4 file or calls C4 macros (`Person`, `System`, `Container`, `Rel`, …) is a **C4 diagram**. A new diagram kind, `c4`, with its own icon.
- **New diagram chooser:** C4 Context, Container, Component, Dynamic and Deployment starters, plus examples.
- **Outline:** people, systems, containers, components and boundaries as a tree, and relationships. Selecting one highlights its line and its shape.
- **Help and completion:** macro names and their parameters (`Container(alias, label, techn, descr)`), as snippets.
- **Semantic review** (version history, AI edits, propose): elements and relationships added, removed, renamed or re-pointed, instead of a line diff.
- **Visual editing** (later slice): select an element on the canvas, rename it, change its technology or description, add a relationship by dragging, and add elements from a palette. Every edit is a source edit of the macro call, like the other diagram types.

## 4. The standard library

- **C4 first.** C4-PlantUML is MIT-licensed. Bundle the version that matches the PlantUML engine version (`@plantuml/core` 1.2026.6), about 250 KB, loaded only when a diagram uses it.
- **Other libraries later, on demand:** icon sets (`tupadr3` Font Awesome, Material), AWS, Azure, Kubernetes. Some are several MB, so they are loaded per file, not per library, and only when used. Each library's licence is checked before bundling.
- **Updates:** a script copies the library from the matching `plantuml-stdlib` release, records the version, and a test checks the bundled copy is the one the engine expects.

## 5. Security and privacy

- The sandbox, its CSP and its "no network" rule do not change. Expansion happens in the app, on text.
- Git includes use the same provider client, token and server checks as Open from GitHub/GitLab: only the origin's own repository and server, paths normalised and kept inside the repository (no `..` above the root), read-only.
- Included text from Git is held in memory for the session. It is not stored in the document (section 7, decision 2).
- Arbitrary URLs stay blocked. The C4 URL mapping recognises only exact `raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/<ref>/<known file>` links, and serves the bundled copy whatever the `<ref>`.
- Limits on depth, size and cycles protect against include bombs.

## 6. Slices

Effort for one developer: **S ≈ days, M ≈ 1–3 weeks**.

| Slice                                 | Delivers                                                                                                                                      | Effort | Gate                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| **I0. Spike (done)**                  | Inline the C4 library by hand and render the five C4 diagram types in the bundled engine. Measure the time.                                   | S      | All five render like the official PlantUML server, in under 2 s on a warm worker.                     |
| **I1. Expander and C4 library**       | `render/includes.ts` with the line map; bundled C4 loaded on demand; C4 links mapped; themes on the same mechanism; blocked-include messages. | M      | C4 examples render; errors in included text point at the right file and line; nothing new is fetched. |
| **I2. Includes in a document**        | Include another diagram of the same `.pumlu` by name; missing-include diagnostic with "add as diagram"; Ctrl-click to open.                   | S–M    | A shared style diagram updates every diagram that includes it.                                        |
| **I3. Includes from Git and folders** | Resolve relative includes from the origin repository (GitHub, GitLab) or the opened folder; cached; listed in the includes panel.             | M      | A real repository with shared includes opens and renders without changes.                             |
| **I4. C4 kind**                       | Detection, icon, chooser starters and examples, outline, help and macro completion.                                                           | M      | A new user can create a Container diagram from the chooser and find each element in the outline.      |
| **I5. C4 semantic review**            | Element and relationship changes in version history, AI edits and the propose description.                                                    | M      | Known fixture edits give the expected review groups.                                                  |
| **I6. C4 visual editing**             | Select, rename, edit fields, add relationships and elements on the canvas.                                                                    | M–L    | The C4 edits round-trip without touching unrelated source.                                            |
| **I7. More libraries**                | Icon sets and cloud libraries, per file and on demand.                                                                                        | S each | Size budget kept; licences checked.                                                                   |

I7 spike (sprites, tupadr3 licences, sizes, timings, slices): [sprites-spike.md](sprites-spike.md). **I7a (raster sprite rendering, restored C4 person icon, export checks, security note) is done**; I7b to I7f follow the spike's recommendation.

> **2026-11-25:** I5 and I6 are replaced by [C4 editing](c4-editing-plan.md), which brings C4 up to the other diagram types.

**Suggested order:** I0 → I1 → I2 → I3 → I4, then decide on I5–I7 from use. After I1, every C4 file in the world that uses the standard library renders in the app. After I3, whole repositories do.

## 7. Decisions

Decided on 2026-11-24:

1. **C4 is its own diagram kind** (`c4`), with its own icon, chooser starters, outline, help and macro completion (I4).
2. **Included text from Git is kept in memory for the session only.** The repository stays the source of truth and nothing extra is saved in the document. A snapshot made from such a diagram uses the already expanded render, so it still shows correctly.
3. **After C4, icon libraries come first** (`tupadr3` Font Awesome and Material): they are small per icon and common in C4 diagrams. Cloud libraries (AWS, Azure, Kubernetes) follow demand.
4. **C4 visual editing (I6) waits** until the C4 kind is in use; I5 and I6 are planned then.

## 8. Out of scope

- Fetching includes from arbitrary URLs.
- Editing an included file from inside the diagram that includes it (open it instead).
- Structurizr DSL, or a C4 model shared across diagrams (connected diagrams may come later).
- Rendering libraries the bundled engine doesn't support.

## 9. How to know it works

- The C4-PlantUML sample diagrams render the same as on the official PlantUML server.
- A repository with shared include files (a fixture, plus one real repository of yours) opens from GitHub and renders every diagram.
- Syntax errors inside an included file name that file and line.
- Network logs show no new requests, except reads from the origin's own Git host.

## 10. Progress and notes

Implemented 2026-11-25: I0 to I4, and I7a (raster sprites). I5 (semantic review), I6 (visual editing) and the rest of I7 (icon libraries) are not started.

### I0 spike result

The bundled `@plantuml/core` 1.2026.6 renders all five C4 diagram types (Context, Container, Component, Dynamic, Deployment) once the C4-PlantUML library text is inlined. Measured in Chromium through the app (typing the source, debounce, expansion, render, SVG on screen): about 1.0 s for a warm render, about 2.1 s the first time a diagram type is shown in a fresh page (this includes loading the C4 chunk and the engine's first layout of that type). The 2 s gate holds on a warm worker.

Engine limits found:

- **Raster sprites (fixed in I7a).** The worker used to reject raster content, so C4's default person icon failed the whole render with `createImageData is not a function` and the bundled library text switched it off. The worker now writes sprites as PNG data: URLs (`render/sprite-canvas.ts`; security note in [rendering](rendering.md#raster-sprites-and-the-worker-canvas)), the override is gone and `Person(...)` shows its icon. SVG sprites with long path data still overflow the engine's stack in Chromium (known limit, see [sprites-spike.md](sprites-spike.md)).
- **Font measurement.** Before each render the app measures every distinct word of the source in every font and hands the table to the worker. Over the expanded C4 text (130 KB of macro bodies) that took WebKit longer than the 30 s render timeout, so every render after the first failed there. The table is now built from the authored text plus the library's own short stereotype and legend words; other text is measured from its characters. WebKit then renders a Container diagram in about 1 s warm.
- Everything else the starters use (boundaries, nested deployment nodes, numbered relationships, `!function`/`!procedure`/`!$var`, named parameters) works.
- C4-PlantUML tag **v2.14.0** (released 2026-08-26) is bundled, from https://github.com/plantuml-stdlib/C4-PlantUML. The seven library files total 134 KB (25 KB gzipped); each is its own on-demand chunk, so a Container diagram loads about 96 KB (C4.puml 68 KB, C4_Context 22 KB, C4_Container 6 KB). The main bundle is unchanged. `scripts/update-c4-stdlib.mjs <tag>` refreshes the files, and a test checks that the recorded tag, the version inside `C4.puml` and the licence agree.

### How it works

- `render/includes.ts` expands includes on text, with a line map (every expanded line to its file and line). `prepareIncludes` loads what is missing; `expandIncludes` is synchronous. Themes use the same mechanism (`bundled-themes.ts` keeps only the loaders).
- `render/plantuml-source.ts` builds the render plan: expansion, then the blocked-directive pass, note removal and the Gantt chain rewrite, with the map kept in step.
- The map turns the engine's `Syntax Error? ... line N` into `line L in <file>`, and the "[From textarea (line N) ]" error picture the engine draws for an unknown macro is rewritten the same way. The preview notice names the file and offers no jump when the line is in an included file.
- **Cache invalidation.** The render cache key includes a hash of the expanded text, so a changed included diagram, theme or Git file is never served from a stale entry. The renderer re-runs when another diagram of the document changes (a signature of the document's diagrams), when included text finishes loading (the include cache version) and when the app's include environment changes (tabs, projects).
- **Git and folder context.** `app/use-include-environment.ts` registers an environment that answers, per open tab: the other diagrams of the same `.pumlu` document (live tab text wins over saved text); the origin repository for a tab opened from GitHub or GitLab (read with the existing provider client and token, same ref, root-relative path, `..` above the root refused before any request); or the folder (or ZIP) document the tab belongs to (read through the folder handle; another member's open tab wins). Included Git and folder text is kept only in an in-memory cache, per session, and is never written to the document. "Read included files again" empties that cache.
- **Blocked.** Other URLs (`!includeurl`, `http...`), standard library files that are not bundled, `!import`, remote themes and the `%load_json`, `%getenv`, `%dirpath`, `%filename`, `%file_exists` builtins stay blocked, with a message. The engine sandbox, its CSP and its no-network rule are unchanged.
- **Known limits.** An `!include` inside an `!if` is expanded whether or not the condition holds (the expander does not evaluate conditions); C4's own `RELATIVE_INCLUDE` choice is the one pattern handled. A relative include in an unsaved standalone file has no place to read from and is reported as such. Folder includes are re-read when a member tab changes or on "Read included files again", not when the file changes on disk.

### C4 detection

A diagram is C4 when its source (after `@startuml`) includes `<C4/...>` or an official C4-PlantUML link, or calls a C4 element macro (`Person`, `System`, `Container`, `Component`, the `_Ext`/`Db`/`Queue` variants, boundaries, `Deployment_Node`). `Rel`, `Node` and layout macros alone are not enough. The check runs before the component and class rules, because `Component(...)` would otherwise read as a component declaration. The kind is chosen when a diagram is created or opened; typing C4 into another kind's tab does not switch it. Old files load unchanged; the portable format accepts `c4` (a file with a C4 diagram does not open in older versions).
