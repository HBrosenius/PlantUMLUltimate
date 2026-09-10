# Connected project diagrams: first implementation slice

Prepared: 2026-09-10. Baseline: remote `main` at `8cd3b5e` (portable documents, PR #41). Planning branch: `codex/connected-project-plan`, in an isolated worktree. This document specifies future implementation; it does not authorize deployment or change the existing checkout.

## Outcome and scope

A user opens a project containing several `.puml` and `.pumlu` documents, manually connects a Sequence participant, a Class entity, and a Gantt task, and navigates between them. The app shows backlinks and reverse-impact paths, preserves identity during supported in-app renames, and makes missing or ambiguous targets visible. The entire project can move between machines without absolute-path repair.

Deliver only:

1. A documented, versioned project sidecar and stable project/diagram/element/link IDs.
2. A project navigator with folder access and a ZIP fallback.
3. Manual typed links among the three supported object kinds.
4. Backlinks, bounded reverse-impact queries, broken-link diagnostics and manual repair.
5. Rename-safe identity updates and explicit persistence/recovery semantics.
6. Compatibility and interrupted-save tests before any cross-file source refactoring.

Do not add inferred links, shared model generation, automatic scheduling effects, cross-file rename, general graph editing, repository OAuth, project collaboration, project-wide encryption, or automatic merges of independently edited manifests. Links express declared relationships; they do not prove implementation dependencies.

## Existing boundaries to reuse

Located through Graft on this baseline:

| Boundary                          | Evidence                                                            | Implication                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Native document schema            | `packages/document-format/src/types.ts:117–126`, `PortableDocument` | Existing UUID `documentId` is useful evidence, but project membership needs its own ID. Do not add project fields to strict native v1.           |
| Native framing                    | `apps/web/src/file-service.ts:47–49`, `isPortableDocument`          | Detect native content by magic, not filename alone. Reuse its decoder and limits.                                                                |
| Portable history identity mapping | `apps/web/src/document-format/history-mapping.ts:32–69`             | Keep local tab/history IDs separate from portable project IDs.                                                                                   |
| Save lifecycle                    | `apps/web/src/document-format/save-coordinator.ts:12–42`            | Reuse snapshot/revision checks; a multi-file commit requires an additional project coordinator.                                                  |
| File and tab lifecycle            | `apps/web/src/use-document-files.ts:54–67,101–664`                  | Integrate through named open/save actions; preserve native encryption, history and external-change behaviour.                                    |
| Symbol provider                   | `apps/web/src/semantic-symbol-provider.ts:104–131,435–595`          | Use supported semantic operations and typed before/after identity information. Existing parser IDs and source ranges are not durable identities. |

`docs/portable-document-format-v1.md` contains implemented format details alongside older staged-task wording. Source and tests determine actual behaviour. Task C00 must refresh Graft and verify these spans, current instructions, APIs and tests before editing.

## Storage decisions

### Folder representation

Use one UTF-8 JSON manifest named **`project.pumlproject`** at the project root. Documents retain their existing formats in relative subdirectories:

```text
order-system/
  project.pumlproject
  diagrams/checkout.puml
  diagrams/domain.pumlu
  planning/release.pumlu
```

The manifest owns membership, stable IDs, locators and links. Each document owns its source, and `.pumlu` continues to own its history/settings. Search indexes, resolved geometry, parser objects and impact results are derived and never authoritative persistent state.

One manifest is the first-slice limit. No nested projects or discovery through symlinks. Project membership references actual files; adding a standalone tab requires choosing/copying it to a project-relative path. Never silently link to an external absolute path.

### Archive representation

**`<project-name>.pumlproject.zip`** is an ordinary ZIP containing exactly one root `project.pumlproject` and the referenced files at their relative paths. It is a transport representation of the same project, not a second schema.

Support standard stored/deflated entries through a maintained ZIP library chosen in C00 after checking its browser/Worker support, license and bounded extraction API. Do not implement ZIP parsing by hand. No archive encryption, ZIP64, nested archives, symlink entries or executable extraction in v1. Leave native `.pumlu` contents as bytes; do not decode/re-encode unchanged files or recompress them merely to preserve membership.

Folder mode writes through granted directory/file handles where available. ZIP mode imports into a staged virtual project and downloads a new complete archive on Save Project. Report “Downloaded project snapshot”; do not imply the previous ZIP was overwritten. Both modes use the same manifest validator/resolver and require no server.

### Path and input rules

Paths are literal relative POSIX paths, not URLs. Reject absolute paths, drive prefixes, backslashes, empty segments, `.`/`..`, NUL/control characters, and platform-reserved filename components. Do not URL-decode paths. Normalize names to NFC at creation and reject noncanonical imported paths; detect case-folded/NFC collisions for portable cross-platform behaviour. Validate archive entry names before extraction and before mapping to handles. Never fetch network content to resolve a path.

Initial configurable-in-code caps: 200 documents, 5,000 element registrations, 10,000 links, 2 MiB manifest, 256 MiB archive input and aggregate uncompressed entries, 1,000 archive entries, and 512 characters per relative path. Native files must additionally satisfy existing native decoder limits; plain sources use the native format's 5 MiB source limit. Reject oversized declarations early and count streamed bytes, because ZIP metadata is untrusted. Cancel and discard staging on limit failure. These are product defaults to benchmark, not performance claims.

## Manifest v1

Publish a JSON Schema, a written specification and golden fixtures before UI integration. Below is the shape; angle-bracket values describe fields rather than a valid fixture.

```json
{
  "format": "plantuml-ultimate-project",
  "schemaVersion": 1,
  "projectId": "<UUID>",
  "revisionId": "<UUID for this committed manifest>",
  "name": "Order system",
  "documents": [
    {
      "id": "<project diagram UUID>",
      "path": "diagrams/checkout.puml",
      "format": "plantuml",
      "observedSourceHash": "<SHA-256 of exact UTF-8 source>"
    }
  ],
  "elements": [
    {
      "id": "<element UUID>",
      "documentId": "<project diagram UUID>",
      "kind": "sequence-participant",
      "locator": {
        "symbolKey": "Checkout",
        "keyType": "alias",
        "declarationHash": "<SHA-256>",
        "sourceHash": "<SHA-256>",
        "from": 12,
        "to": 52
      }
    }
  ],
  "links": [
    {
      "id": "<link UUID>",
      "kind": "represents",
      "from": "<sequence-participant UUID>",
      "to": "<class-entity UUID>"
    }
  ]
}
```

For native members use `format: "pumlu"`, plus `expectedNativeDocumentId` once decoded. Store optional `observedFileHash` (SHA-256 of raw bytes) for conflict detection, distinct from source hash. These are evidence of what was last observed, not an instruction to reject legitimate file edits permanently.

All IDs are UUIDs generated once. Require unique IDs and paths, valid bounded strings and finite integers. Canonical writer order is documents/elements/links by ID; preserve paths and names exactly. `revisionId` changes on a persisted manifest edit. Reject unsupported schema versions without rewriting them. Reject unknown v1 fields rather than silently dropping future metadata.

Persist registrations for deleted/unresolved elements so links retain their endpoint identity. Missing referenced files are a valid degraded project state, not grounds for erasing membership. A link naming an element ID absent from `elements`, an element naming an absent member ID, or invalid link type endpoints is structurally invalid: refuse import before replacing current state. Distinguish these errors from a valid registration whose source target no longer exists.

## Stable identity and resolution

### Diagram identity

The project member UUID is authoritative within the project. Relative path locates the file; native `documentId` is secondary identity evidence. Save As currently preserves native identity, so two native copies may have the same ID: never collapse them automatically. Register intentional copies as distinct project members. Replacing a member with a different native ID needs explicit rebind; moving the whole root requires no changes.

“Locate missing file” can search candidate hashes/native IDs and propose a match, but ambiguity needs user selection. Changing a member's path within the app preserves member and element UUIDs. This slice need not physically rename/move files; it may repair the reference after a user moves them.

### Element identity

Create a UUID when a supported element is first registered for linking. Scope: explicit Sequence participant declarations, Class entity declarations, and Gantt task declarations. Exclude implicit Sequence participants, Class members/packages, Gantt milestones, dependencies and other diagram types in v1. Show a precise unsupported-target message.

The locator is evidence, not identity. `symbolKey` is the parser's exact alias when available, otherwise its unambiguous semantic key; `keyType` distinguishes those cases. `declarationHash` hashes exact declaration bytes. `from/to` use the parser's UTF-16 code-unit offsets into the source whose hash is recorded. Never treat line number, label, alias, or parser-generated ID as the permanent ID.

Resolution order:

1. With an identical source hash, require the declaration at the stored range to have the expected kind/key/hash. Any disagreement is corrupt/stale evidence, not a fallback match.
2. After changed source, automatically relocate only one exact declaration-hash match of the same kind, or an app-recorded successful semantic operation mapping that proves old → new. Reordering unchanged declarations can therefore survive.
3. A same-alias/key candidate with changed declaration text is a repair suggestion, not proof. Mark it `needs-review` until the user confirms. Do not attach deleted/recreated elements by recycled alias silently.
4. Zero candidates means missing; multiple candidates means ambiguous. Keep the original UUID and links until repaired or explicitly deleted.

Conservative external-edit resolution is deliberate. A text-only sidecar cannot prove identity through arbitrary outside edits. Supported in-app changes provide stronger evidence and can refresh locators automatically. Registering and resolving links must never insert comments or aliases into `.puml` or change the `.pumlu` schema.

### Supported rename guarantee

The existing semantic Rename command for a registered participant/entity/task (including supported alias changes) produces source plus an identity mapping for the selected declaration. After generated-edit validation succeeds, update source and the locator in one in-memory transaction; the element UUID remains unchanged. Rejected operations change neither. Undo/redo applies the inverse/forward locator mapping together with source.

Inventory name-changing inspector actions in C00. Wire those that prove a single before/after declaration to the same mapping contract. Until covered, their changed targets must become visibly unresolved rather than falsely claiming rename safety. Release acceptance requires semantic Rename for all three target kinds; document exactly which inspector workflows are also covered.

Plain typing, pasted source, historical restore and incoming collaboration changes trigger conservative re-resolution. Project links are not collaboration-shared in v1. No cross-file rename or source rewrite is part of this guarantee.

## Link semantics and impact results

Support two directed relations:

- **represents:** Sequence participant → Class entity.
- **implements:** Gantt task → Sequence participant or Class entity.

The UI uses explicit language: “This participant represents…” and “This task implements…”. Prevent duplicate `(kind, from, to)` links; permit many-to-many relationships. Link deletion removes the link, not an endpoint or source object.

Backlinks list direct incoming relationships; the details panel also shows outgoing links. Reverse impact traverses incoming edges from the selected element, displaying the full evidence path. Example: Class entity ← represents ← participant ← implements ← task. Use a visited set, default depth two, maximum depth five and 200 result nodes. Show truncation and the applied depth, not an apparently complete list.

Results mean “linked items to review,” not guaranteed breakage or schedule delay. Do not combine historical source with current graph results. Show current resolved graph revision and label results from unsaved source/manifest. Missing, locked, ambiguous, unsupported and parse-error states remain visible; do not count unresolved paths as confirmed impact. Offer “Show unresolved links” separately and explain incomplete results.

## Navigator and everyday workflow

1. Create/Open Project selects a folder or ZIP; import and validate into staging first.
2. Navigator shows relative paths, diagram kind when known, dirty state, locked/missing/unresolved badges and link counts.
3. Opening a member reuses its project-bound tab; separate standalone copies remain separate. Index current sources without rendering every diagram or loading historical previews.
4. Select a supported diagram object or source declaration and choose Link. The picker lists valid endpoints in available project documents; locked/missing/invalid targets are disabled with reasons.
5. Backlinks and impact panels jump to a document and highlight a resolved declaration. Broken entries offer Locate file, Choose replacement element, Retry parse/unlock, or Remove link.
6. Save Project saves a reviewed project snapshot; standalone Save keeps its existing meaning but coordinates dirty locators when needed.

Adding `.puml` files preserves their format in project saves. Do not silently invoke standalone native Save As for every member. Use an explicit “Convert to native” action later or the existing native flow with a reviewed membership path update. Text member save must still use source validation/dirty-state protections where applicable.

## Encryption and portability boundaries

The manifest and ZIP are **not encrypted**. Paths, project name and relationship topology are visible. Explain this before registering encrypted members. Store no labels, locators, source hashes, declaration hashes or native IDs for encrypted members in the plaintext manifest; filenames remain visible by the nature of the project.

First slice: encrypted `.pumlu` files may appear in the navigator as opaque members and be copied unchanged to ZIP, but **cannot be registered as link endpoints**, even while unlocked. This prevents project metadata from undermining the native encryption boundary. The UI explains that linking encrypted content requires a future encrypted project format.

Export copies encrypted member bytes only after any dirty changes have been saved through the existing encryption flow. Never export decrypted source, keys or history into staging/recovery/ZIP. Existing memory-only plaintext rules remain in force. Do not unlock files merely to enumerate the navigator.

Moving a folder or round-tripping a ZIP retains all UUIDs and relative paths. Opening duplicate projects creates separate local session namespaces. Export of an individual `.pumlu` intentionally does not include the project graph: tell users to export the project for portable links.

## Save, recovery and conflict guarantees

### State ownership

Project state has its own revision, dirty status, manifest snapshot and resolved index. Document tabs retain existing source/history ownership. A project controller coordinates snapshot IDs and never duplicates the authoritative source in a second model. Link-only edits dirty the manifest; supported rename dirties both document and manifest.

Serialize project commits and member saves through one coordinator. Capture all involved revisions, flush existing pending document checkpoints, and snapshot the chosen files before encoding. Recheck raw file and manifest hashes before overwrite. Changes during save remain dirty after the captured snapshot succeeds.

### ZIP mode

Build a complete archive from a consistent staged manifest plus member byte snapshots; validate it before offering download. Do not replace the active project on failed/cancelled import. For incomplete projects, allow opening in degraded mode, but block portable export until missing files are located or explicitly removed with affected links reviewed. The default export includes all members and preserves native history/options.

### Folder mode: recoverable, not falsely atomic

There is no portable multi-file atomic browser filesystem transaction. Use a project-specific recovery journal and backups under `.pumlultimate-recovery/<transaction-uuid>/`, excluded from normal navigator/export.

Before touching originals, stage intended bytes, exact previous bytes and a bounded journal containing project ID, old/new revision IDs, paths and before/after hashes. If originals plus staged data exceed a recovery cap of 512 MiB, refuse the operation and offer ZIP snapshot export. Await successful staging writes before any overwrite.

Then write changed documents one at a time and write the manifest **last**. Keep journal/backups until all writes and final hash verification succeed. On next open, inspect pending transactions and offer Resume or Roll back only when every current path matches its expected before/after hash. If a third-party change appears, do not overwrite it; preserve staged data and offer export/manual reconciliation.

Recovery is idempotent: retrying after another interruption must not duplicate history or change IDs. Remove journal data only after verified completion; cleanup failure becomes a visible recoverable warning. Do not claim power-loss durability beyond browser/OS guarantees. A journal improves recoverability but is not a database transaction.

Use the same protocol for source+locator renames so a crash cannot permanently leave a silently misbound link. Routine single-file saves with no related manifest changes can use the existing save path under the shared lock. Plaintext recovery is allowed only for unencrypted members. Stage encrypted bytes, never decrypted content.

### External change policy

Check membership/manifest bytes before write and on explicit Refresh Project. Reparse changed members and rebuild resolution. Concurrent manifest changes trigger Reload external, Save local project as ZIP, or Cancel; automatic merge is deferred. Rebinding a changed native identity, choosing a new element, or removing membership requires a preview of affected links.

Permission cancellation, missing files, parse failures and locked members never delete project data automatically. Keep the previous active project until a replacement has passed staging validation.

## Module boundaries

```text
packages/project-model/src/
  types.ts / validate.ts / paths.ts
  identity.ts             # Resolver states and explicit mapping application
  links.ts / impact.ts    # Pure graph operations
  index.ts                # Explicit public exports
apps/web/src/projects/
  README.md
  project-controller.ts   # Revisions, member/tab binding, action wiring
  project-index.worker.ts # Bounded parsing/index refresh, stale result rejection
  project-storage.ts     # Common virtual/folder interface
  folder-project.ts / zip-project.ts
  project-save.ts / project-recovery.ts
  ProjectNavigator.tsx / LinkDialog.tsx / LinkedItemsPanel.tsx
```

The pure package has no React, file handles, native encryption or app state imports. Inject element summaries from the existing parsers. Worker messages carry project/document revision IDs; discard stale responses. Index source one member at a time or with small bounded concurrency, cache by source hash, and never initialize renderers to answer graph questions.

Reuse native codecs and source-operation contracts. Do not implement new document encryption or a second history store. Source mutation adapters emit explicit identity mappings; the model never guesses them from a global search-and-replace.

## Bounded implementation stages

One row per Sol session; split a row further when multiple lifecycle boundaries need changes. Use Graft first and exact local tests. Do not depend on completing a general app refactor.

| Task | Deliverable                                                                                                                                               | Acceptance gate                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| C00  | Refresh code map, rename caller inventory, real browser/file capabilities, existing portable regression tests; select ZIP library and document its limits | Written boundary map and implementation test inventory, no architecture guesses left about native save hooks |
| C01  | Manifest schema, path validation, fixtures, format documentation                                                                                          | Strict versions/types/UUIDs, path/case collisions, degraded vs invalid project distinction                   |
| C02  | Pure registration, resolution and repair logic for three kinds                                                                                            | Identical source, reorder, changed aliases, duplicate declarations, deleted/recreated objects, missing files |
| C03  | Directed link commands and impact traversal                                                                                                               | Typed endpoints, duplicates, backlinks, evidence paths, cycles, depth/result bounds                          |
| C04  | Virtual project import and navigator using existing document opening                                                                                      | No tab/history ID collision, no rendering during indexing, cancellation leaves active project intact         |
| C05  | Folder adapter, permissions and raw snapshots                                                                                                             | Relative moves, revoked permissions, file format preservation, native bytes/history unchanged                |
| C06  | ZIP adapter and staged round-trip                                                                                                                         | All path/extraction caps; fresh-profile portability; byte-preserved encrypted members                        |
| C07  | Link creation, backlinks, impact and repair UI                                                                                                            | Full participant→entity←task example, visible unresolved states, keyboard navigation                         |
| C08  | Semantic rename identity mappings for each target kind, one kind per subtask                                                                              | Rename/alias changes survive undo/redo; failed validation changes nothing; external edits conservative       |
| C09  | Save coordinator and recovery journal                                                                                                                     | Fault injection after every write; manifest last; resume/rollback idempotent; third-party changes preserved  |
| C10  | Member Save integration, dirty/source+metadata revision tracking, native Save As/path rebinding                                                           | No stale save clears later edits; copies retain independent local identity; concurrent writes serialized     |
| C11  | Recovery/compatibility/privacy browser suites, performance measurements, user docs                                                                        | Required full scenario below passes before feature release                                                   |

Dependencies: C01 before C02/C03; C04 depends on C01–C03; C05/C06 build on C04; C07 on C04; C08 on C02/C07; C09 on C05/C06 and existing save snapshots; C10 on C08/C09. The UI can be developed behind a feature flag, but folder writing and rename guarantees must not ship before recovery tests pass.

## Test matrix and release gates

- **Golden format:** v1 manifest round-trip, unsupported future version, unknown fields, invalid graph, missing member and old `.puml`/native v1 compatibility. Do not alter native fixture bytes.
- **Identity:** all three rename kinds, alias edits, label edits, undo/redo, source restore, reorder, duplicate names, explicit deletion and replacement, identical native IDs at different paths, changed native ID at same path.
- **Graph:** direct/reverse links, multi-hop evidence, incomplete/ambiguous endpoints, stale worker responses, repeated imports and bounded cycles.
- **Archive:** traversal, absolute paths, backslashes, case/NFC collisions, symlink/encrypted/nested entries, unexpected root manifests, truncated archive, declared-vs-actual size, streaming bomb, unsupported compression and extra unreferenced files. Reject unexpected archive files rather than unpacking them silently; permit directory entries within the entry cap.
- **Recovery:** cancellation before staging, failed document close, failure after each original write, failed final manifest write, crash after success before journal deletion, lost permissions, concurrent external edit, second crash during rollback. Verify no source/history loss and no silent retargeting.
- **Privacy:** encrypted members copied byte-for-byte when unchanged; no decrypted content or locators in manifest/index persistence/journal/ZIP; blocked endpoint registration; fresh-profile native unlock continues working.
- **Usability/accessibility:** navigator and link picker keyboard operation, focus on jump, clear broken/locked/unsupported badges, project/file dirty distinctions, readable conflict recovery.
- **Performance:** representative 10/50/200-document fixtures within aggregate caps; record indexing, memory and ZIP time. Verify UI cancellation and no rendering of unopened diagrams. Set budgets from measured results, not guessed wall-clock assertions.

Defining end-to-end gate: create three linked mixed-format documents; save folder project; rename each supported target; undo/redo once; interrupt a project save and recover; export ZIP; import on a clean browser profile; move the project root; confirm stable IDs, complete links and native history; delete one declaration externally and see a broken link with an explicit repair action.

Run focused pure and browser tests at each stage; run existing `npm run validate`, `npm run test:e2e`, `npm run test:e2e:collaboration`, and `npm run test:e2e:pwa` plus the new project suite at release. Planning did not execute application tests or benchmark the implementation.

## Handoff prompt for Sol

```text
Implement task C__ only from docs/connected-project-diagrams-plan.md.
Start with repository instructions, git status, and Graft queries for the named
boundaries. Verify prerequisite tasks in actual code. Read the smallest source
spans and tests needed. List owned state and injected dependencies before editing.
Preserve the native document format, history, encryption, standalone workflows,
and unrelated working-tree changes. Do not add cross-file refactoring or inferred
links. If a task requires two independent lifecycle changes, finish one substep
and leave a precise next handoff. Run targeted tests and typecheck, recording
exact results. Update project format docs and task progress; refresh Graft after
substantial code changes. Do not deploy or silently commit/push.
```

The first useful milestone is a ZIP-backed navigator with validated manual links and conservative resolution. The complete first slice additionally requires supported rename integration and recoverable folder saves. Cross-file refactoring starts only after those guarantees are demonstrated.
