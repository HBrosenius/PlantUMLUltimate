# Connected project diagrams: C00 implementation inventory

Verified against `origin/main` at `8cd3b5e` on 2026-09-10.

## Boundaries confirmed

- Native document detection and byte-safe reads/writes live in `apps/web/src/file-service.ts`. `readDocumentBytes`, `writeDocumentBytes`, and `isPortableDocument` are the reuse boundary for project members. Native source must not be decoded merely to package an unchanged member.
- Standalone open/save actions are coordinated in `apps/web/src/use-document-files.ts` and `apps/web/src/document-format/save-coordinator.ts`. Project save will sit above these actions; it must not replace tab/history identity or native encryption handling.
- `createSemanticSymbolProvider` in `apps/web/src/semantic-symbol-provider.ts` supplies declaration occurrences and semantic rename validation. Its current rename result contains generated source and next display key but no durable before/after declaration mapping. C08 must extend that contract for the three project endpoint kinds.
- Existing browser file typing exposes single-file pickers only. Folder mode will need a narrowly typed `showDirectoryPicker` adapter and permission checks; it cannot reuse the single-file fallback as a false folder save.
- No ZIP package is currently installed. C06 will add `fflate`: a maintained, browser/Worker-compatible MIT implementation with explicit byte-array APIs. Archive input/output stays behind the storage adapter, and C06 must enforce the plan's byte, entry, compression, and path limits while reading entries.

## Test inventory

- `apps/web/src/file-service.test.ts` exercises picker fallbacks and byte writes.
- `apps/web/src/semantic-symbol-provider.test.ts` covers semantic rename validation and generated source.
- Portable-document browser regressions live in `tests/e2e/editor.spec.ts` and `tests/e2e/editor-sequence.spec.ts`.
- `packages/project-model/src/project-model.test.ts` begins the new pure-model coverage for C01--C03. Browser storage, navigator, rename and recovery tests remain intentionally deferred to their stages.

## Ownership decision

`@plantuml-studio/project-model` owns validated manifest data, paths, pure identity resolution, typed links, and impact traversal. It has no React, filesystem, renderer, native-codec, encryption, or tab-history dependencies. The web project controller will inject parsed declaration summaries and source hashes.
