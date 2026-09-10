import {
  DEFAULT_HISTORY_POLICY,
  encodeContentHistory,
  hashSource,
  planRetention,
  portableVersionMetadata,
  type PortableDocument,
  type PortableDocumentSettings,
} from "@plantuml-studio/document-format";
import type { DocumentSnapshot, DocumentVersion } from "../workspace-storage";
import { mapLocalHistoryForRetention } from "./history-mapping";

export async function assemblePortableDocument(
  document: DocumentSnapshot,
  localVersions: readonly DocumentVersion[],
  settings: PortableDocumentSettings = { resourceCapacities: document.resourceCapacities ?? {} },
  savedAt = new Date().toISOString(),
): Promise<PortableDocument> {
  const candidates = mapLocalHistoryForRetention(localVersions);
  const localBaseline = localVersions.find((version) => version.id === document.baselineVersionId);
  const portableBaselineId = localBaseline
    ? candidates.find((version) => version.id === localBaseline.portableId)?.id
    : undefined;
  const policy = {
    maxVersions: document.historyMaxVersions ?? DEFAULT_HISTORY_POLICY.maxVersions,
    maxLogicalBytes: document.historyMaxLogicalBytes ?? DEFAULT_HISTORY_POLICY.maxLogicalBytes,
  };
  const retention = planRetention(candidates, policy, portableBaselineId);
  const encoded = await encodeContentHistory(retention.retained.map((version) => version.source));
  const versions = retention.retained.map((version, index) =>
    portableVersionMetadata(version, encoded.contentIds[index]!),
  );
  return {
    schemaVersion: 1,
    documentId: document.portableDocumentId ?? crypto.randomUUID(),
    savedAt,
    current: {
      source: document.source,
      sourceHash: await hashSource(document.source),
      diagramKind: document.diagramKind,
      ...(portableBaselineId ? { baselineVersionId: portableBaselineId } : {}),
    },
    settings,
    historyPolicy: policy,
    versions,
    contents: encoded.contents,
  };
}
