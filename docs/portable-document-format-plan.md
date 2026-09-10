# Portable documents with history, compression, and encryption

Date: 2026-09-09. Status: implemented on 2026-09-10. This document is retained as the implementation and verification specification.

## Decision

Introduce **PlantUML Ultimate Document**, extension **`.pumlu`**, as the default Save/Save As format. It contains one diagram's current source, retained version history, and document settings. PlantUML remains the editable source inside the document; **Export → PlantUML** produces a normal `.puml` file.

Use a versioned binary envelope around a JSON payload, gzip compression enabled by default, and optional password-based AES-256-GCM encryption. Encode retained history as full snapshots and bounded incremental records. Keep the current source independently readable after payload decoding; it must never depend on replaying history.

Default retention: **100 historical versions and a 16 MiB logical history budget**, whichever is reached first. Protect pinned versions and the active comparison baseline; if protected history exceeds the budget, require the user to resolve the conflict instead of silently deleting it.

This is a single-document format, not a replacement for the existing multi-document workspace backup. No attachments, rendered SVG, live collaboration state, or arbitrary ZIP entries in v1.

## Current implementation and required changes

Graft was used to locate the relevant code. These spans describe the inspected checkout and must be refreshed before implementation.

| Evidence                          | Current behaviour                                                                                                      | Required change                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `file-service.ts:1–43,132–164`    | File reads use text; writable interface accepts strings; Save As writes source                                         | Byte-oriented I/O and explicit native/PlantUML format detection                             |
| `use-document-files.ts:68–217`    | Open creates fresh history; Save As creates a new lineage and clears baseline; Save records a checkpoint after writing | Import portable history; Save As retains history/baseline; stage checkpoint before encoding |
| `workspace-storage.ts:253–344`    | Version records contain full source, metadata, hash; equal sources are deduplicated across existing history            | Preserve metadata/events while deduplicating content separately; recompute portable SHA-256 |
| `workspace-storage.ts:75,391–418` | Automatic history limit is 30 unpinned versions; imports write by supplied IDs                                         | Explicit retention policy; collision-safe local IDs and portable IDs                        |
| `workspace-backup.ts:65–86`       | Existing backup imports documents plus full versions                                                                   | Continue compatibility and prevent encrypted content leaking into plaintext backups         |
| `VersionHistoryDialog.tsx:46–716` | History comparison, imports, pinning, restoration, semantic review                                                     | Keep UI behaviour; add retention and “history has unsaved changes” status                   |

Use `graft map`, `graft ask "<symbol>" --source`, `graft skeleton <file>`, and `graft callers <symbol>` first. Read exact pointed-to spans when additional detail is necessary. Do not start by rereading `App.tsx` or implementing an older refactor plan verbatim.

## Why this storage design

| Option                                   | Assessment                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full snapshots + gzip only               | Simple and useful as a reference implementation, but repeated large snapshots may exceed gzip's effective repetition window. History grows with versions × source size. |
| Unlimited delta chain                    | Small for minor edits, but slow reconstruction, pruning dependencies, and corruption propagation make it unsuitable.                                                    |
| ZIP with one entry per version           | Familiar container, but adds archive handling and typically compresses each version independently. Entry extraction and encryption complicate a one-document format.    |
| Bounded snapshots + simple deltas + gzip | Recommended. Short replay chains, predictable pruning, compact local edits, full-snapshot fallback for rewrites.                                                        |

Do not claim a measured compression ratio yet. Benchmark the recommendation against compressed snapshots using actual edit histories before freezing v1 fixtures. Retain the specified format unless measurements identify a concrete problem; performance tuning must not silently change decoding semantics.

## V1 envelope: exact byte layout

Extension `.pumlu`; MIME `application/octet-stream` initially. Recognize the magic bytes, not the extension alone.

```text
Offset  Length  Meaning
0       8       ASCII "PUMLUDOC"
8       1       Envelope version: 1
9       4       Header JSON byte length, unsigned little-endian
13      N       Strict UTF-8 JSON header (N <= 4096)
13+N    rest    Payload bytes, optionally compressed and encrypted
```

Header is either:

```json
{ "compression": "gzip", "encryption": "none" }
```

or:

```json
{
  "compression": "gzip",
  "encryption": "aes-256-gcm",
  "kdf": "pbkdf2-sha256",
  "iterations": 600000,
  "salt": "<base64 of 16 random bytes>",
  "iv": "<base64 of 12 random bytes>",
  "tagBits": 128
}
```

`compression` is `gzip` or `none`. Encrypted payload is Web Crypto ciphertext with its appended GCM authentication tag. Authenticate **all exact envelope bytes before the payload** as AES-GCM additional authenticated data, including magic, version, length, and serialized header. Never parse and reserialize the header to construct AAD on read.

Reject unsupported versions, algorithm names, unexpected v1 header fields, invalid base64/lengths, truncated bodies, and invalid integer lengths before expensive operations. Future algorithms require an explicit compatible specification revision; never guess or fall back to plaintext after an encryption error.

Pipeline: validate logical document → retain history → encode records → JSON UTF-8 → gzip if enabled → encrypt if enabled → envelope. Read in reverse; authenticate before decompressing encrypted data.

## Logical payload and identities

The JSON payload has `schemaVersion: 1`, `documentId` (UUID), `savedAt` (UTC ISO timestamp), `current`, `settings`, `historyPolicy`, `versions`, and `contents`.

- `current`: exact `source`, SHA-256 hash, diagram kind, and optional `baselineVersionId` referencing a retained version.
- `settings`: allowlisted document settings only, initially resource capacities. Inventory existing per-document settings in task F00; add a documented schema for any other setting required to reproduce document behaviour. Keep theme, cursor, zoom, and split position local.
- `historyPolicy`: `maxVersions` and `maxLogicalBytes`.
- `versions`: oldest-to-newest records, ordered by an explicit integer `sequence`, then ID for imported legacy ties. Each contains `id`, optional `parentVersionId`, `contentId`, `createdAt`, `reason`, `label?`, `author?`, `pinned`, and diagram kind. Parent relationships are provenance, not delta dependencies.
- `contents`: unique source representations keyed by a lowercase SHA-256 hex content ID. Hash **exact UTF-8 bytes**, without line-ending or Unicode normalization. Do not use the existing noncryptographic fallback hash.

Portable version IDs and document IDs survive native Save and Save As. Each open tab receives a fresh local session ID and local history namespace. Never use an incoming version ID directly as an IndexedDB primary key: translate to new local IDs and retain a portable-ID mapping. Opening two copies must not overwrite or share mutable local history accidentally.

On legacy import, assign portable version UUIDs once and persist the mapping. Preserve labels, authors, timestamps and reasons; map baseline and retained parent references. Omit parent links to pruned ancestors and record `ancestryTruncated: true` on that record. Restoring a version creates a new checkpoint, not a rewrite of its historical record.

Do not serialize handles, OAuth credentials, collaboration URLs/tokens, passwords, cryptographic keys, socket state, caches, or machine paths. Source may itself contain confidential comments or Jira identifiers: encrypt the entire payload, including history and settings, when enabled.

### Content record shapes

```ts
type ContentRecord =
  | { id: string; kind: "full"; source: string; byteLength: number }
  | {
      id: string;
      kind: "splice";
      baseContentId: string;
      prefixBytes: number;
      deleteBytes: number;
      insertBase64: string;
      byteLength: number;
    };
```

The current source is stored directly even if its content also appears in history. This deliberate duplication simplifies recovery and guarantees the working copy is independent of the delta chain.

## Incremental history algorithm

1. Apply retention to logical full versions first. Deduplicate content by SHA-256 plus actual byte equality. Do not deduplicate version metadata: returning to earlier source can be a distinct meaningful checkpoint.
2. Visit retained versions in stable sequence order. Reuse an existing content record for identical bytes.
3. For new content, compare against the immediately preceding retained version's content. Find the longest identical UTF-8 **byte** prefix and non-overlapping suffix; the middle becomes one replacement splice. Byte slicing may split a multibyte character internally; reconstruct all bytes before fatal UTF-8 decoding.
4. Compare the serialized UTF-8 size of the complete splice record with the complete full record, including base64 overhead. Use the splice only if it is at least 20% smaller and the base's replay depth is below 9. Otherwise write a full record. Thus any chain has at most nine splice applications.
5. Verify reconstructed length and SHA-256 for every content record. Require bases to occur earlier; reject cycles, missing bases, out-of-range deletes, negative/noninteger offsets, and duplicate IDs.
6. Rebuild the entire bounded content table on each save after pruning. Never delete a base out of an existing encoded chain. Remove unreferenced contents.

Complexity is linear in the bytes compared, with bounded replay depth. No LCS/Myers implementation, UI diff, or semantic-review group should be used as the storage codec. A broad rewrite naturally becomes a full snapshot. Multiple distant edits can produce a large single splice; accepting that tradeoff keeps v1 implementable and testable by a smaller model.

Use periodic full records through the depth bound, not arbitrary timestamp ordering. Materialize selected historical content on demand through a bounded cache. Validate all records during open in a Worker without retaining every expanded source in memory.

## Retention and resource limits

Policy defaults are product choices, not externally mandated limits:

- Default 100 versions; configurable from 10 to 500.
- Default 16 MiB logical history; configurable 1–64 MiB.
- Logical budget: sum of UTF-8 source lengths of distinct retained contents plus serialized version metadata bytes. Compression does not exempt a file from this budget.
- Current source is never pruned and is excluded from history budgets. Native format initially supports at most 5 MiB UTF-8 for any individual source.
- Reader caps: 80 MiB file bytes, 80 MiB decompressed JSON, 500 version records, 500 content records, 64 MiB total expanded unique historical source bytes, nine delta steps, and bounded metadata fields. Proposed field caps: label 512 characters, author name 256, identifier 128. Define precise validation for capacities and all metadata in the schema.

Retain pinned versions and the selected baseline first. Fill remaining capacity newest-first; remove oldest unprotected records until both budgets fit. No silent protection override. If protected history alone is too large, keep the current document intact and offer unpin, remove baseline protection, raise the policy within supported bounds, or save a new copy with explicitly selected history.

Show a retention preview before the first pruning save and whenever lowering limits removes records. Afterwards, normal pruning under the accepted policy is automatic with a visible saved-version count. Do not prune in-memory or browser history as a side effect of a failed/cancelled file save.

Align local checkpoint retention with the configured policy: the old 30-version pruner must not discard content before portable saving can include it. Snapshot generation remains event-based (save/manual/restore/collaboration checkpoints), not every keystroke. Unchanged Save does not manufacture a duplicate event; identical content reached through a later restore may have its own event.

Count streamed decompression output as it arrives and abort at the cap. Enforce record, replay, reconstructed-byte and metadata limits as well: small delta JSON can expand into large logical history. Do not trust claimed byte lengths, hashes, or an envelope's advertised properties.

## Compression and encryption

### Compression

Default to gzip through `CompressionStream`/`DecompressionStream`. Both compression modes use the same extension. Keep all native format code in a Worker and report progress/busy state for large files. Capability-check APIs; never silently write uncompressed data while claiming gzip. Supported browsers must read gzip fixtures offline before release. [MDN Compression Streams](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API)

### Password encryption

Use Web Crypto PBKDF2-HMAC-SHA-256 to derive an AES-256-GCM key. V1 writer uses 600,000 iterations, a random 16-byte salt for each new password setup, random 12-byte IV **on every save**, and a 128-bit tag. Reader accepts 600,000–2,000,000 iterations; reject outside that range before derivation. Reassess this policy with benchmark evidence before release.

PBKDF2 is selected for native browser availability and a small implementation dependency surface. OWASP prefers memory-hard password hashing generally; its PBKDF2 guidance includes 600,000 SHA-256 iterations. That is a work-factor reference, not certification of this file-encryption scheme. A future memory-hard KDF can be introduced explicitly. [OWASP password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Use exact password UTF-8 with no trimming/normalization. Require confirmation on setup; recommend a long passphrase and explain that there is no password recovery. Keep a non-extractable derived key in memory for the unlocked session so ordinary Save needs no repeated password prompt. Store neither password nor key in IndexedDB/localStorage. Retain the salt and iteration settings with that key; change password generates a fresh salt/key. On locked reopen, derive again. [MDN AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams), [OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Changing any authenticated header/ciphertext byte must fail authentication. Report “Incorrect password or damaged file,” without claiming to distinguish those cases. Never attempt partial encrypted recovery or bypass authentication. AES-GCM protects file contents and detects tampering; it does not hide filename, file size, or the fact that encryption is enabled.

### Browser recovery policy: essential to the feature

V1 encrypted documents use **memory-only plaintext state** while unlocked. Route their source/history through an in-memory repository; filter them out of normal session persistence, localStorage fallback, persisted version history, and plaintext workspace backups. A persisted placeholder may record only an opaque ID and locked-document state, not source, history, labels, or title.

The UI must say: “Encrypted file. Unsaved changes are kept only in this session; save before closing.” Keep dirty-tab/unload protection. This deliberately trades crash recovery for a tractable confidentiality boundary in v1; encrypted recovery snapshots are later work.

When enabling encryption for a previously persisted document, stage the file first. After successful write, remove that document's recoverable plaintext session/history entries and migrate live state to the memory repository. Treat cleanup failure as a blocking privacy error, retry, and never claim local protection until successful. Explain that prior downloaded backups or filesystem history are not erased and browser storage deletion is not forensic secure erasure.

Workspace backup skips encrypted documents and lists omissions; offer to save those individually. Explicit PlantUML/SVG/PNG export is plaintext and should say so for encrypted documents. Encryption does not change live collaboration into end-to-end encrypted collaboration: joining still transmits the current source to the configured service. State that boundary clearly in the encryption dialog.

## User-visible file behaviour

- **New:** default filename `untitled.pumlu`; compression on, encryption off.
- **Open:** accept native magic or legacy PlantUML; native encrypted files request a password before import. Decode/schema-check before creating a tab or writing local history.
- **Legacy `.puml` open:** keep import/external-observation context, but first Save asks for a native destination. Never overwrite the legacy file with binary bytes. History can include existing local checkpoints attached to that tab.
- **Save:** write source + retained history + settings using remembered format options. Encryption remains on when reopening encrypted files; no silent downgrade.
- **Save As:** retain portable document identity, versions, and baseline; local handle changes only on success. A separate “Start a new document without history” command can fork identity later. This intentionally changes the old Save As lineage test.
- **Export → PlantUML:** current source only, no history; never changes the native handle, native name, dirty state, or encryption setting. Generalize export extension stripping so `.pumlu` does not produce awkward double extensions.
- **History changes:** rename, pin, delete, baseline selection, and document settings changes mark the native document dirty even if source is unchanged.
- **Downloaded save fallback:** say “Downloaded snapshot,” not “Written to disk.” Track the produced snapshot as last exported file state; do not claim filesystem persistence can be verified.

Update Open pickers, upload fallback, drag/drop if present, launch-file consumers, PWA manifest file handlers, menu help, keyboard actions, and tests. Native magic with an unsupported version is a native-format error, not PlantUML text.

## Save transaction and external edits

Introduce a per-document revision covering source, history metadata, settings, and format options. Serialize saves per document; disallow concurrent writes to the same handle across tabs where handle identity can be compared.

1. Capture document ID/revision/source/options; flush pending collaboration checkpoints for that document and take a consistent snapshot. Stage a save checkpoint with a stable ID for retries.
2. Obtain the file picker during the user gesture, before long compression/KDF work; selection alone does not create or truncate the file.
3. Apply retention to the staged snapshot and obtain required pruning acceptance. Encode and validate bytes before opening a writable stream.
4. Recheck the observed destination bytes/revision for an existing file. Only then write, await close, and abort on write failure where the API supports it. Do not clear dirty state or prune local history on failure.
5. Commit local saved-state/checkpoint bookkeeping only after file success. Mark clean only if the document's revision still matches the captured revision; otherwise indicate that a snapshot was saved and newer changes remain unsaved.
6. If file write succeeds but local bookkeeping fails, report that distinction and allow reconciliation by reopening the valid file. Do not pretend a database and filesystem write are one atomic transaction.

Extend file handles to write `Uint8Array`/`Blob` and optionally abort; preserve text exports. Track raw byte digest/size/mtime plus the decoded baseline for native files. Re-encoding an encrypted file changes IV/ciphertext even for the same source, so raw change detection must be followed by decoded revision comparison.

For v1 native external changes: offer **Reload external**, **Save local as a separate copy**, or **Cancel**; do not automatically three-way merge two history containers. Detect metadata-only external changes too. Preserve a dirty local copy before reload. Keep existing legacy PlantUML source merging for observed `.puml` files.

Browser file APIs do not provide universal cross-process compare-and-swap. Rechecking narrows but cannot eliminate an external writer race; document the limitation. Do not invent a guarantee of crash-proof atomic saves across all download/native-file backends.

## Implementation boundaries

Create `packages/document-format/` with explicit public APIs and no React, IndexedDB, or DOM imports. Web Crypto/compression primitives are dependencies of codec adapters; data encoding/retention remain pure.

```text
packages/document-format/src/
  types.ts                 # Portable DTOs, limits, typed errors
  validate.ts              # Strict schema and relationship validation
  retention.ts             # Pure selection + protected overflow result
  content-codec.ts          # Full/splice selection and reconstruction
  envelope.ts              # Binary framing, exact header bytes
  compression.ts           # Bounded gzip/none
  encryption.ts            # KDF, key creation, authenticated encryption
  encode.ts / decode.ts    # Composition only
  index.ts                 # Small explicit public surface
apps/web/src/document-format/
  document-format.worker.ts
  format-client.ts         # Request IDs, cancellation, transfer buffers
  history-mapping.ts       # Portable/local IDs and legacy migration
  document-repository.ts   # Persistent vs memory-only history routing
  save-coordinator.ts      # Revision-based save lifecycle
```

Public contracts should include `planRetention`, `encodeDocument`, `decodeDocument`, and typed failures (`unsupported-version`, `invalid-file`, `limit-exceeded`, `password-required`, `unlock-failed`, `protected-history-overflow`). Keep cancellation separate from failures. Do not give pure modules application setters or a giant workspace object.

## Sol implementation tasks

Execute one row per session; split substeps if more than 3–5 meaningful production files need logic changes. Each task begins with Graft and ends with exact verification results and a minimal handoff. Refresh Graft after substantial code changes. Do not perform a general refactor alongside this feature.

| ID  | Work / minimal context                                                                                                                                                                                                 | Completion check                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| F00 | Locate actual document/history/persistence/backup/PWA entry points through Graft. Inventory settings, source limits, browsers, tests. Record baseline and confirm schema field names/limits in a format specification. | Current dependency map and tests; explicit encrypted-document data-flow inventory.                                                            |
| F01 | New format types, validation and golden uncompressed fixture; read only spec and existing version types.                                                                                                               | Exact framing, schema rejection, future-version errors, portable ID validation.                                                               |
| F02 | Pure retention + legacy history mapping, separately.                                                                                                                                                                   | Stable pruning, protected overflow, baseline and parent remapping, duplicate open isolation.                                                  |
| F03 | Full/splice codec and content hashes.                                                                                                                                                                                  | Unicode/CRLF/empty/rewrite/reversion fixtures; depth 9; malformed delta rejection; no normalization.                                          |
| F04 | Bounded gzip/none adapters and Worker client.                                                                                                                                                                          | Decompression bombs aborted, cancellation/stale response handling, offline browser round-trip.                                                |
| F05 | Encryption adapter with injected randomness in tests only.                                                                                                                                                             | Known-answer fixture plus random save variation, wrong password, header/payload tampering, KDF caps.                                          |
| F06 | Byte I/O and native detection beside existing text helpers.                                                                                                                                                            | Picker/upload/launch reads, cancellation/write failure, legacy never overwritten as native.                                                   |
| F07 | Persistent/memory-only repository routing and encrypted-tab persistence exclusion.                                                                                                                                     | No encrypted document source/history/metadata in IndexedDB/localStorage or workspace backup, including hydration/close/duplicate/error paths. |
| F08 | Native open and portable history import.                                                                                                                                                                               | Reopen in fresh browser profile reproduces all retained versions/settings/baseline; failed open has no partial state.                         |
| F09 | Save coordinator with revision and checkpoint staging; then Save As separately.                                                                                                                                        | Concurrent typing/tab switching/history change, failed close, cancelled pruning, stable retry checkpoint, changed Save As semantics.          |
| F10 | Settings UI: compression/encryption/retention; password setup/unlock; encryption enable/disable lifecycle.                                                                                                             | Options remembered; downgrade explicit; plaintext cache cleanup failure handled; protected overflow resolvable.                               |
| F11 | Native external-change flow, text export, PWA registrations, backup omissions.                                                                                                                                         | Metadata-only change detected; external password change handled; plaintext exports leave native state intact.                                 |
| F12 | Benchmarks, full integration/browser/PWA checks, user docs and release migration notes.                                                                                                                                | No source/history loss, complete compatibility matrix, measured costs, polished recovery/error messages.                                      |

F05 can be developed before F07, but encrypted UI must not ship or be enabled until F07's persistence boundary passes. F08 relies on F01–F04/F06–F07; F09 relies on F02/F08; F10 relies on F05/F07/F09. A temporary unencrypted codec is a development milestone, not completion of the requested feature.

Suggested session prompt:

```text
Implement task F__ from docs/portable-document-format-plan.md only.
Use Graft first to locate current symbols and callers. Read the task's exact
contracts/tests, not the entire app. Preserve unrelated working-tree changes.
Write a short dependency/read list, implement one bounded module or integration
step, and run its focused tests plus typecheck. Do not weaken size, encryption,
history, or dirty-state guarantees to get tests passing. If a decision is missing,
record the narrow conflict and resolve the contract before expanding the task.
Finish with changed files, exact checks/results, remaining limits, and the next
task's minimal context. Do not deploy. Refresh Graft after substantial changes.
```

## Verification and release acceptance

- Format fixtures: all four compression/encryption combinations; valid empty source; Unicode and CRLF preservation; malformed JSON/header; truncation; unsupported schema; unknown algorithms; invalid graph and hash; file/decompression/logical expansion limits.
- History fixtures: 0/1/100/500 versions; sparse and complete rewrites; revisiting prior content; pinned overflow; deleted delta base after re-encoding; historical diagram kinds; labels/authors; current not present in history; baseline retained.
- Lifecycle tests: manual checkpoint before Save, history-only dirty state, import same file twice, Save As retains history, password change, clear encryption, reload with wrong password, failures and cancellation, tabs switched/closed during operations.
- Privacy tests: unique sentinel source and version labels must not appear in browser persistence or plaintext workspace backup for encrypted tabs, including existing-session migration, collaboration checkpoints, duplicates, and fallback paths.
- Integration tests: native file copied to a clean profile reproduces current and historical sources exactly; exports remain normal PlantUML; native external edits cannot silently discard history; PWA handles both file types offline.
- Performance corpus: 10 KiB, 100 KiB, 1 MiB source × 10/100 versions where within budgets, plus near-limit and 500-version small-source fixtures. Compare raw snapshots, gzip snapshots, hybrid+gzip. Record output bytes, encode/decode duration, peak memory where measurable, and KDF time separately in Chromium/Firefox/WebKit. Do not create flaky wall-clock correctness assertions.
- Run focused package/storage/file tests per task, then `npm run validate`, `npm run test:e2e`, `npm run test:e2e:collaboration`, and `npm run test:e2e:pwa` before release. No suites were run for this planning document.

Release only when a user can save an encrypted or unencrypted native file, move it to another machine, inspect/restore retained history, and save it again without source, metadata, or protection loss. Publish the binary and JSON format specification plus fixtures so the format remains recoverable independently of this app.

## Deferred deliberately

Multi-document archives, attachments/thumbnails, incremental append-only disk writing, automatic native-history merges, encrypted browser crash recovery, end-to-end collaboration encryption, password recovery, and multiple KDF choices. They are separate capabilities, not prerequisites for a portable, bounded, compressed and optionally encrypted single-document format.
