import {
  decodeDocument,
  DOCUMENT_LIMITS,
  DocumentFormatError,
  hashSource,
  sha256,
  type PortableDocument,
  type UnlockedDocumentKey,
} from "@plantuml-studio/document-format";
import {
  PROJECT_FORMAT,
  parseProjectManifestJson,
  serializeProjectManifest,
  type ProjectManifest,
} from "@plantuml-studio/project-model";
import { isPortableDocument } from "../file-service";
import { indexVirtualProject, type ProjectMemberInput, type VirtualProject } from "./project-index";
import type { ProjectSaveStore } from "./project-save-coordinator";

export interface ProjectFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable?: () => Promise<{ write(data: string | Uint8Array): Promise<void>; close(): Promise<void> }>;
}

export interface ProjectDirectoryHandle {
  readonly name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<ProjectFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<ProjectDirectoryHandle>;
  removeEntry?(name: string): Promise<void>;
}

export function folderProjectStore(root: ProjectDirectoryHandle): ProjectSaveStore {
  const handle = async (path: string, create = false) => {
    const parts = path.split("/");
    let directory = root;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part!, { create });
    return { directory, file: await directory.getFileHandle(parts.at(-1)!, { create }) };
  };
  return {
    async write(path, bytes) {
      const { file } = await handle(path, true);
      if (!file.createWritable) throw new Error("Project folder write permission was denied");
      const writable = await file.createWritable();
      await writable.write(bytes);
      await writable.close();
    },
    async read(path) {
      try {
        return new Uint8Array(await (await (await handle(path)).file.getFile()).arrayBuffer());
      } catch {
        return undefined;
      }
    },
    async remove(path) {
      if (!root.removeEntry) return;
      await root.removeEntry(path).catch(() => undefined);
    },
  };
}

export type FolderProject = VirtualProject & {
  root: ProjectDirectoryHandle;
  nativeDocuments: ReadonlyMap<
    string,
    { document: PortableDocument; compression: "gzip" | "none"; unlockedKey?: UnlockedDocumentKey }
  >;
};

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
  options: { password?: string } = {},
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
    const decoded = await decodeDocument(bytes, options);
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

export async function readFolderProject(
  root: ProjectDirectoryHandle,
  passwordFor?: (document: ProjectManifest["documents"][number]) => Promise<string | undefined>,
): Promise<FolderProject> {
  const manifestHandle = await root.getFileHandle("project.pumlproject");
  const manifestJson = await (await manifestHandle.getFile()).text();
  const manifest = parseProjectManifestJson(manifestJson);
  const inputs = new Map<string, ProjectMemberInput>();
  const nativeDocuments = new Map<
    string,
    { document: PortableDocument; compression: "gzip" | "none"; unlockedKey?: UnlockedDocumentKey }
  >();
  const observed = await Promise.all(
    manifest.documents.map(async (document) => {
      try {
        const bytes = new Uint8Array(await (await (await fileAt(root, document.path)).getFile()).arrayBuffer());
        let input = await memberInputFromBytes(document, bytes);
        if (document.format === "pumlu" && input.state === "locked" && passwordFor) {
          const password = await passwordFor(document);
          if (password !== undefined) input = await memberInputFromBytes(document, bytes, { password });
        }
        inputs.set(document.path, input);
        if (document.format === "pumlu" && input.state === "available") {
          const decoded = await decodeDocument(bytes);
          nativeDocuments.set(document.id, {
            document: decoded.document,
            compression: decoded.compression,
            ...(decoded.unlockedKey ? { unlockedKey: decoded.unlockedKey } : {}),
          });
        }
        return {
          id: document.id,
          observedFileHash: await sha256(bytes),
          ...(input.state === "available" ? { observedSourceHash: await hashSource(input.source) } : {}),
        };
      } catch (error) {
        inputs.set(
          document.path,
          missing(error)
            ? { state: "missing" }
            : { state: "unsupported", reason: "Folder permission was denied or the member cannot be read" },
        );
        return undefined;
      }
    }),
  );
  const byId = new Map(
    observed.filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => [item.id, item]),
  );
  const observedManifest = {
    ...manifest,
    documents: manifest.documents.map((document) => ({ ...document, ...byId.get(document.id) })),
  };
  return { ...(await indexVirtualProject(serializeProjectManifest(observedManifest), inputs)), root, nativeDocuments };
}

export async function createFolderProject(root: ProjectDirectoryHandle, name: string): Promise<FolderProject> {
  const documentId = crypto.randomUUID();
  const manifest: ProjectManifest = {
    format: PROJECT_FORMAT,
    schemaVersion: 1,
    projectId: crypto.randomUUID(),
    revisionId: crypto.randomUUID(),
    name: name.trim() || root.name || "PlantUML project",
    documents: [{ id: documentId, path: "diagrams/project.puml", format: "plantuml" }],
    elements: [],
    links: [],
  };
  const diagrams = await root.getDirectoryHandle("diagrams", { create: true });
  const diagram = await diagrams.getFileHandle("project.puml", { create: true });
  if (!diagram.createWritable) throw new Error("Creating a project requires folder write permission");
  const diagramWriter = await diagram.createWritable();
  await diagramWriter.write("@startgantt\nProject starts 2026-01-01\n[First task] lasts 1 day\n@endgantt\n");
  await diagramWriter.close();
  const manifestFile = await root.getFileHandle("project.pumlproject", { create: true });
  if (!manifestFile.createWritable) throw new Error("Creating a project requires folder write permission");
  const manifestWriter = await manifestFile.createWritable();
  await manifestWriter.write(serializeProjectManifest(manifest));
  await manifestWriter.close();
  return readFolderProject(root);
}
