import type { PortableVersion, RetentionVersion } from "@plantuml-studio/document-format";
import type { DocumentVersion } from "../workspace-storage";

export interface MappedPortableHistory {
  historyId: string;
  versions: DocumentVersion[];
  baselineVersionId?: string;
  portableToLocalIds: ReadonlyMap<string, string>;
}

export function mapLocalHistoryForRetention(versions: readonly DocumentVersion[]): RetentionVersion[] {
  const ascending = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const ids = new Map(ascending.map((version) => [version.id, version.portableId ?? crypto.randomUUID()]));
  return ascending.map((version, sequence) => ({
    id: ids.get(version.id)!,
    ...(version.parentVersionId && ids.has(version.parentVersionId)
      ? { parentVersionId: ids.get(version.parentVersionId)! }
      : {}),
    source: version.source,
    sourceHash: version.sourceHash,
    createdAt: version.createdAt,
    sequence,
    reason: version.reason,
    ...(version.label ? { label: version.label } : {}),
    ...(version.author ? { author: version.author } : {}),
    pinned: version.pinned,
    diagramKind: version.diagramKind,
  }));
}

/** Every import gets a fresh local namespace and IDs, so opening one file twice cannot collide. */
export function mapPortableHistoryToLocal(
  versions: readonly PortableVersion[],
  sources: ReadonlyMap<string, string>,
  fileName: string,
  portableBaselineVersionId?: string,
  createId: () => string = () => crypto.randomUUID(),
): MappedPortableHistory {
  const historyId = `history-${createId()}`;
  const portableToLocalIds = new Map(versions.map((version) => [version.id, `version-${createId()}`]));
  const localVersions = versions.map((version): DocumentVersion => {
    const source = sources.get(version.contentId);
    if (source === undefined) throw new Error(`Missing reconstructed content ${version.contentId}`);
    const localId = portableToLocalIds.get(version.id)!;
    const parentVersionId = version.parentVersionId ? portableToLocalIds.get(version.parentVersionId) : undefined;
    return {
      id: localId,
      portableId: version.id,
      historyId,
      ...(parentVersionId ? { parentVersionId } : {}),
      source,
      sourceHash: version.contentId,
      fileName,
      diagramKind: version.diagramKind,
      createdAt: version.createdAt,
      reason: version.reason,
      ...(version.label ? { label: version.label } : {}),
      ...(version.author ? { author: version.author } : {}),
      pinned: version.pinned,
    };
  });
  const baselineVersionId = portableBaselineVersionId ? portableToLocalIds.get(portableBaselineVersionId) : undefined;
  return {
    historyId,
    versions: localVersions,
    ...(baselineVersionId ? { baselineVersionId } : {}),
    portableToLocalIds,
  };
}
