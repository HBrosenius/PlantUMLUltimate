import {
  encodeDocument,
  hashSource,
  sha256,
  type PortableDocument,
  type UnlockedDocumentKey,
} from "@plantuml-studio/document-format";
import type { ProjectManifest } from "@plantuml-studio/project-model";
import type { DocumentSnapshot } from "../workspace-storage";
import type { ProjectSaveOperation, ProjectSaveStore } from "./project-save-coordinator";

const text = new TextEncoder();

export type FolderSavePlan = {
  manifest: ProjectManifest;
  members: readonly ProjectSaveOperation[];
};

/** Reject a save if a member being replaced changed since the last project snapshot. */
export async function ensureProjectMembersUnchanged(
  store: Pick<ProjectSaveStore, "read">,
  manifest: ProjectManifest,
  members: readonly ProjectSaveOperation[],
): Promise<void> {
  for (const member of members) {
    const document = manifest.documents.find((item) => item.path === member.path);
    if (!document?.observedFileHash) continue;
    const current = await store.read?.(member.path);
    if (!current) throw new Error(`Project member ${member.path} disappeared before it could be saved`);
    if ((await sha256(current)) !== document.observedFileHash)
      throw new Error(`Project member ${member.path} changed outside PlantUML Ultimate; reopen it before saving`);
  }
}

/**
 * Produces the member writes for a folder project. Only tabs opened through the
 * project can contribute, so an unrelated editor tab can never overwrite a
 * project member with the same file name.
 */
export async function planFolderProjectSave(
  manifest: ProjectManifest,
  memberTabIds: ReadonlyMap<string, string>,
  tabs: readonly DocumentSnapshot[],
  nativeDocuments: ReadonlyMap<
    string,
    { document: PortableDocument; compression: "gzip" | "none"; unlockedKey?: UnlockedDocumentKey }
  > = new Map(),
): Promise<FolderSavePlan> {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const changed = new Map<string, string>();
  for (const document of manifest.documents) {
    const tab = byId.get(memberTabIds.get(`${manifest.projectId}:${document.id}`) ?? "");
    if (!tab?.dirty) continue;
    changed.set(document.id, tab.source);
  }

  const hashes = new Map(
    await Promise.all([...changed].map(async ([id, source]) => [id, await hashSource(source)] as const)),
  );
  const members = await Promise.all(
    [...changed].map(async ([documentId, source]) => {
      const document = manifest.documents.find((item) => item.id === documentId)!;
      if (document.format === "plantuml") return { path: document.path, bytes: text.encode(source) };
      const native = nativeDocuments.get(document.id);
      if (!native)
        throw new Error(
          `Cannot save changed native project member ${document.path} without an unlocked portable document`,
        );
      const portable: PortableDocument = {
        ...native.document,
        savedAt: new Date().toISOString(),
        current: { ...native.document.current, source, sourceHash: await hashSource(source) },
      };
      return {
        path: document.path,
        bytes: (
          await encodeDocument(portable, {
            compression: native.compression,
            ...(native.unlockedKey ? { unlockedKey: native.unlockedKey } : {}),
          })
        ).bytes,
      };
    }),
  );
  const memberByPath = new Map(members.map((member) => [member.path, member]));
  const documents = await Promise.all(
    manifest.documents.map(async (document) => {
      const source = changed.get(document.id);
      if (source === undefined) return document;
      const bytes = memberByPath.get(document.path)!.bytes;
      const observedSourceHash = hashes.get(document.id);
      if (!observedSourceHash) throw new Error(`Could not hash changed project member ${document.path}`);
      return { ...document, observedSourceHash, observedFileHash: await sha256(bytes) };
    }),
  );
  return { manifest: { ...manifest, revisionId: crypto.randomUUID(), documents }, members };
}
