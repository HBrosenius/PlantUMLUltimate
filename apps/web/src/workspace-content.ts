import type { WorkspaceSession } from "./workspace-storage";

const navigation = new Set(["cursor", "zoom", "zoomInitialized", "diagramScroll", "viewMode", "revision"]);
/** Reference comparison avoids serializing unchanged document sources on navigation. */
export function sameWorkspaceContent(a: WorkspaceSession, b: WorkspaceSession): boolean {
  if (a.documents.length !== b.documents.length) return false;
  return (
    a.documents.every((document, index) => {
      const other = b.documents[index]!;
      return Object.keys({ ...document, ...other }).every(
        (key) => navigation.has(key) || document[key as keyof typeof document] === other[key as keyof typeof other],
      );
    }) &&
    Object.keys({ ...a, ...b }).every(
      (key) =>
        ["documents", "activeDocumentId", "viewMode", "splitPercent", "theme", "recoverySavedAt"].includes(key) ||
        a[key as keyof WorkspaceSession] === b[key as keyof WorkspaceSession],
    )
  );
}
