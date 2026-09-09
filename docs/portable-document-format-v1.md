# PlantUML Ultimate Document v1

Status: implementation baseline for tasks F00–F01. The `.pumlu` format is not yet wired into the application and must not be presented as available until the remaining lifecycle tasks are complete.

## Scope and ownership

One `.pumlu` file contains one PlantUML document, its retained version events, the active comparison baseline, resource-capacity settings, and format policy. It never contains rendered output, file handles, machine paths, credentials, collaboration state, or cached data. Theme, editor layout, cursor, and zoom remain local preferences.

The pure `@plantuml-studio/document-format` package owns DTOs, strict validation, limits, and binary framing. It has no React, IndexedDB, or application-state dependency. Later tasks add retention, content reconstruction, compression, encryption, and the web Worker boundary.

## Current data-flow inventory

| Data                              | Current owner and persistence                                                                                            | Native-format requirement                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Open documents and current source | `workspace-storage.ts`; IndexedDB `plantuml-studio/workspace`, with `plantuml-studio.workspace.v1` localStorage fallback | Native plaintext documents remain recoverable; encrypted documents must be replaced by opaque locked placeholders before UI enablement |
| Version source and metadata       | IndexedDB `document-versions`; full-source records, SHA-256 when Web Crypto exists, 30 automatic unpinned versions       | Translate local IDs to UUIDs, retain events independently from deduplicated content, and align local pruning with portable policy      |
| Baseline                          | `DocumentSnapshot.baselineVersionId` in the persisted workspace session                                                  | Map to a retained portable version UUID and reject missing references                                                                  |
| Resource capacities               | `plantuml-studio.resource-capacities-by-document` in localStorage; names mapped to integer percentages from 1–500        | The only v1 portable document setting; encrypted documents require memory-only routing                                                 |
| File state                        | In-memory handle map and decoded source/mtime/size snapshots                                                             | Add byte snapshots and raw digests; handles and paths are never serialized                                                             |
| Workspace backup                  | Plain JSON containing open document source plus full versions                                                            | Remains a separate multi-document format; encrypted documents must be omitted with a visible report                                    |
| Collaboration                     | In-memory session plus source checkpoints written through document history                                               | Not serialized; encrypted tabs still disclose source to a configured collaboration service and require explicit UI disclosure          |
| Jira                              | Binding and issue baselines in separate browser storage/service state                                                    | Not serialized in v1; Jira identifiers already authored in PlantUML source remain part of encrypted payload                            |

Open, upload fallback, launch-file consumption, Save, Save As, external-file observation, backup/restore, history mutation, exports, and the PWA manifest currently assume text `.puml` files. Tasks F06–F11 must update every path before `.pumlu` becomes the default.

## Binary envelope

The exact byte layout is:

| Offset |    Length | Meaning                                      |
| -----: | --------: | -------------------------------------------- |
|      0 |         8 | ASCII `PUMLUDOC`                             |
|      8 |         1 | Envelope version `1`                         |
|      9 |         4 | Unsigned little-endian header byte length    |
|     13 |         N | Strict UTF-8 JSON header, at most 4096 bytes |
|   13+N | remaining | Payload bytes                                |

The complete prefix through the serialized header is authenticated data for encrypted documents. Readers retain those exact bytes and never reconstruct authenticated data by reserializing JSON.

V1 accepts only `{ "compression": "gzip" | "none", "encryption": "none" }` or the encrypted header specified in the implementation plan. Unknown fields, algorithms, versions, malformed UTF-8/base64, invalid KDF bounds, and truncated lengths are errors. See the golden uncompressed fixture in `packages/document-format/fixtures/uncompressed-v1.pumlu.base64`.

## Logical schema and bounds

`schemaVersion` is `1`. `documentId` and version IDs are UUIDs. Content IDs and source hashes are lowercase SHA-256 hex over exact UTF-8 bytes. Versions are stored oldest-to-newest and sorted by integer `sequence`, then ID; imported legacy ties are allowed. Parent versions must occur earlier. A baseline and every version content ID must resolve within the retained document.

Resource-capacity keys are non-empty and at most 256 characters; values are integers from 1–500, matching the current UI. The only allowed diagram kinds are Gantt, Sequence, Use Case, Class, Activity, and WBS. The portable reason vocabulary matches the six current checkpoint reasons.

Reader and policy bounds are defined by `DOCUMENT_LIMITS` and `DEFAULT_HISTORY_POLICY`: 80 MiB file/header-decoded payload, 5 MiB per source, 500 versions, 500 content records, 64 MiB expanded unique historical source, nine delta applications, default 100 versions, and a default 16 MiB logical history budget. Policy inputs permit 10–500 versions and 1–64 MiB.

Validation is intentionally staged. F01 verifies framing, strict schema, field bounds, and graph references. F03 must additionally reconstruct every content record and verify exact SHA-256, delta ranges, replay depth, and fatal UTF-8 decoding before a document is accepted.
