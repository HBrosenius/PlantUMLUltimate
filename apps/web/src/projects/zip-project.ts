import { Unzip, UnzipInflate, UnzipPassThrough, zipSync } from "fflate";
import {
  parseProjectManifestJson,
  portablePathKey,
  serializeProjectManifest,
  validateProjectPath,
} from "@plantuml-studio/project-model";
import { memberInputFromBytes } from "./folder-project";
import { indexVirtualProject, type ProjectMemberInput, type VirtualProject } from "./project-index";

export const ZIP_PROJECT_LIMITS = {
  maxArchiveBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 256 * 1024 * 1024,
  maxEntries: 1_000,
} as const;

export type ZipProject = VirtualProject & { archiveEntries: ReadonlyMap<string, Uint8Array> };
const text = new TextEncoder();

function archivePath(name: string): string | undefined {
  return name.endsWith("/") ? name.slice(0, -1) : name;
}

async function extractZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength > ZIP_PROJECT_LIMITS.maxArchiveBytes)
    throw new Error("Project archive exceeds the 256 MiB input limit");
  return new Promise((resolve, reject) => {
    const entries = new Map<string, Uint8Array>();
    const portablePaths = new Set<string>();
    let entryCount = 0;
    let expanded = 0;
    let failed: Error | undefined;
    const fail = (error: Error) => {
      if (!failed) failed = error;
    };
    const unzip = new Unzip((file) => {
      const path = archivePath(file.name);
      if (!path || validateProjectPath(path)) {
        fail(new Error("Project archive contains an unsafe entry path"));
        return;
      }
      entryCount += 1;
      if (entryCount > ZIP_PROJECT_LIMITS.maxEntries) {
        fail(new Error("Project archive exceeds the 1,000 entry limit"));
        return;
      }
      const portablePath = portablePathKey(path);
      if (portablePaths.has(portablePath)) {
        fail(new Error("Project archive contains colliding entry paths"));
        return;
      }
      portablePaths.add(portablePath);
      if (file.compression !== 0 && file.compression !== 8) {
        fail(new Error("Project archive uses unsupported compression"));
        return;
      }
      if (file.originalSize !== undefined && file.originalSize > ZIP_PROJECT_LIMITS.maxExpandedBytes) {
        fail(new Error("Project archive entry exceeds the extraction limit"));
        return;
      }
      if (file.name.endsWith("/")) return;
      const chunks: Uint8Array[] = [];
      file.ondata = (error, chunk, final) => {
        if (error) {
          fail(error);
          return;
        }
        expanded += chunk.length;
        if (expanded > ZIP_PROJECT_LIMITS.maxExpandedBytes) {
          fail(new Error("Project archive exceeds the expanded-size limit"));
          file.terminate();
          return;
        }
        chunks.push(chunk);
        if (!final) return;
        const joined = new Uint8Array(chunks.reduce((total, item) => total + item.length, 0));
        let offset = 0;
        for (const item of chunks) {
          joined.set(item, offset);
          offset += item.length;
        }
        entries.set(path, joined);
      };
      file.start();
    });
    unzip.register(UnzipPassThrough);
    unzip.register(UnzipInflate);
    try {
      unzip.push(bytes, true);
      queueMicrotask(() => (failed ? reject(failed) : resolve(entries)));
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Project archive is invalid"));
    }
  });
}

export async function readZipProject(bytes: Uint8Array): Promise<ZipProject> {
  const entries = await extractZip(bytes);
  const manifestBytes = entries.get("project.pumlproject");
  if (!manifestBytes) throw new Error("Project archive is missing project.pumlproject");
  const manifestJson = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
  const manifest = parseProjectManifestJson(manifestJson);
  const expected = new Set(["project.pumlproject", ...manifest.documents.map((document) => document.path)]);
  if ([...entries.keys()].some((path) => !expected.has(path)))
    throw new Error("Project archive contains an unexpected file");
  const inputs = new Map<string, ProjectMemberInput>();
  await Promise.all(
    manifest.documents.map(async (document) =>
      inputs.set(
        document.path,
        entries.has(document.path)
          ? await memberInputFromBytes(document, entries.get(document.path)!)
          : { state: "missing" },
      ),
    ),
  );
  return { ...(await indexVirtualProject(manifestJson, inputs)), archiveEntries: entries };
}

export async function createZipProjectSnapshot(project: ZipProject): Promise<Uint8Array> {
  const contents: Record<string, Uint8Array> = {
    "project.pumlproject": text.encode(serializeProjectManifest(project.manifest)),
  };
  for (const document of project.manifest.documents) {
    const bytes = project.archiveEntries.get(document.path);
    if (!bytes) throw new Error(`Cannot export while ${document.path} is missing`);
    contents[document.path] = bytes;
  }
  const archive = zipSync(contents, { level: 6 });
  if (archive.byteLength > ZIP_PROJECT_LIMITS.maxArchiveBytes)
    throw new Error("Project archive exceeds the 256 MiB export limit");
  await readZipProject(archive);
  return archive;
}
