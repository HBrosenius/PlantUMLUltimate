import { decodeDocument, DOCUMENT_LIMITS, DocumentFormatError } from "@plantuml-studio/document-format";
import { parseProjectManifestJson, type ProjectManifest } from "@plantuml-studio/project-model";
import { isPortableDocument } from "../file-service";
import { indexVirtualProject, type ProjectMemberInput, type VirtualProject } from "./project-index";

export interface ProjectFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
}

export interface ProjectDirectoryHandle {
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<ProjectFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ProjectDirectoryHandle>;
}

export type FolderProject = VirtualProject & { root: ProjectDirectoryHandle };

function missing(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function fileAt(root: ProjectDirectoryHandle, path: string): Promise<ProjectFileHandle> {
  const segments = path.split("/");
  let directory = root;
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment!);
  return directory.getFileHandle(segments.at(-1)!);
}

export async function memberInputFromBytes(
  document: ProjectManifest["documents"][number],
  bytes: Uint8Array,
): Promise<ProjectMemberInput> {
  if (document.format === "plantuml") {
    if (bytes.byteLength > DOCUMENT_LIMITS.maxSourceBytes)
      return { state: "unsupported", reason: "Source file exceeds the 5 MiB project limit" };
    try {
      return { state: "available", source: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch {
      return { state: "unsupported", reason: "Source file is not valid UTF-8" };
    }
  }
  if (!isPortableDocument(bytes)) return { state: "unsupported", reason: "Expected a native .pumlu document" };
  try {
    const decoded = await decodeDocument(bytes);
    if (document.expectedNativeDocumentId && decoded.document.documentId !== document.expectedNativeDocumentId)
      return { state: "unsupported", reason: "Native document identity needs explicit rebind" };
    return { state: "available", source: decoded.document.current.source };
  } catch (error) {
    if (error instanceof DocumentFormatError && error.code === "password-required") return { state: "locked" };
    return {
      state: "unsupported",
      reason: error instanceof Error ? error.message : "Native document could not be read",
    };
  }
}

async function memberInput(
  root: ProjectDirectoryHandle,
  document: ProjectManifest["documents"][number],
): Promise<ProjectMemberInput> {
  try {
    const file = await (await fileAt(root, document.path)).getFile();
    return memberInputFromBytes(document, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (missing(error)) return { state: "missing" };
    return { state: "unsupported", reason: "Folder permission was denied or the member cannot be read" };
  }
}

export async function readFolderProject(root: ProjectDirectoryHandle): Promise<FolderProject> {
  const manifestHandle = await root.getFileHandle("project.pumlproject");
  const manifestJson = await (await manifestHandle.getFile()).text();
  const manifest = parseProjectManifestJson(manifestJson);
  const inputs = new Map<string, ProjectMemberInput>();
  await Promise.all(
    manifest.documents.map(async (document) => inputs.set(document.path, await memberInput(root, document))),
  );
  return { ...(await indexVirtualProject(manifestJson, inputs)), root };
}
