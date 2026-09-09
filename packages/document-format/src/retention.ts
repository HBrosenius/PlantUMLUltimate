import {
  DocumentFormatError,
  type PortableDiagramKind,
  type PortableHistoryPolicy,
  type PortableVersion,
  type PortableVersionAuthor,
  type PortableVersionReason,
} from "./types";

const UTF8 = new TextEncoder();

export interface RetentionVersion {
  id: string;
  parentVersionId?: string;
  source: string;
  sourceHash: string;
  createdAt: string;
  sequence: number;
  reason: PortableVersionReason;
  label?: string;
  author?: PortableVersionAuthor;
  pinned: boolean;
  diagramKind: PortableDiagramKind;
}

export interface RetainedVersion extends RetentionVersion {
  ancestryTruncated?: true;
}

export interface RetentionPlan {
  retained: RetainedVersion[];
  droppedIds: string[];
  logicalBytes: number;
}

function metadataBytes(version: RetentionVersion): number {
  const { source: _source, ...metadata } = version;
  return UTF8.encode(JSON.stringify(metadata)).byteLength;
}

function logicalBytes(versions: readonly RetentionVersion[]): number {
  const sources = new Map<string, number>();
  for (const version of versions) {
    if (!sources.has(version.sourceHash)) sources.set(version.sourceHash, UTF8.encode(version.source).byteLength);
  }
  return versions.reduce((total, version) => total + metadataBytes(version), 0) +
    [...sources.values()].reduce((total, size) => total + size, 0);
}

/** Selects a stable, bounded history without mutating its input. */
export function planRetention(
  versions: readonly RetentionVersion[],
  policy: PortableHistoryPolicy,
  baselineVersionId?: string,
): RetentionPlan {
  const ordered = [...versions].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const protectedIds = new Set(ordered.filter((version) => version.pinned).map((version) => version.id));
  if (baselineVersionId) protectedIds.add(baselineVersionId);
  const protectedVersions = ordered.filter((version) => protectedIds.has(version.id));
  const protectedBytes = logicalBytes(protectedVersions);
  if (protectedVersions.length > policy.maxVersions || protectedBytes > policy.maxLogicalBytes) {
    throw new DocumentFormatError(
      "protected-history-overflow",
      `Protected history requires ${protectedVersions.length} versions and ${protectedBytes} logical bytes`,
    );
  }

  const selected = new Set(protectedIds);
  for (const candidate of [...ordered].reverse()) {
    if (selected.has(candidate.id)) continue;
    const next = ordered.filter((version) => selected.has(version.id) || version.id === candidate.id);
    if (next.length <= policy.maxVersions && logicalBytes(next) <= policy.maxLogicalBytes) selected.add(candidate.id);
  }

  const byId = new Map(ordered.map((version) => [version.id, version]));
  const retained = ordered.filter((version) => selected.has(version.id)).map((version): RetainedVersion => {
    let parentVersionId = version.parentVersionId;
    let truncated = false;
    const seen = new Set<string>();
    while (parentVersionId && !selected.has(parentVersionId)) {
      if (seen.has(parentVersionId)) {
        parentVersionId = undefined;
        break;
      }
      seen.add(parentVersionId);
      truncated = true;
      parentVersionId = byId.get(parentVersionId)?.parentVersionId;
    }
    const result: RetainedVersion = { ...version };
    if (parentVersionId) result.parentVersionId = parentVersionId;
    else delete result.parentVersionId;
    if (truncated) result.ancestryTruncated = true;
    return result;
  });
  return {
    retained,
    droppedIds: ordered.filter((version) => !selected.has(version.id)).map((version) => version.id),
    logicalBytes: logicalBytes(retained),
  };
}

export function portableVersionMetadata(version: RetainedVersion, contentId: string): PortableVersion {
  const { source: _source, sourceHash: _sourceHash, ...metadata } = version;
  return { ...metadata, contentId };
}
