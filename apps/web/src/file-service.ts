export interface WritableFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Uint8Array | Blob): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: object) => Promise<WritableFileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<WritableFileHandle>;
  launchQueue?: {
    setConsumer(consumer: (params: { files: WritableFileHandle[] }) => void): void;
  };
}

export interface OpenedDocument {
  source: string;
  fileName: string;
  handle?: WritableFileHandle;
  lastModified?: number;
  size?: number;
}

export interface FileSnapshot {
  source: string;
  lastModified: number;
  size: number;
}

export interface OpenedFileBytes {
  kind: "native" | "legacy";
  bytes: Uint8Array;
  source?: string;
  fileName: string;
  handle?: WritableFileHandle;
  lastModified: number;
  size: number;
}

const NATIVE_MAGIC = new TextEncoder().encode("PUMLUDOC");

export function isPortableDocument(bytes: Uint8Array): boolean {
  return bytes.length >= NATIVE_MAGIC.length && NATIVE_MAGIC.every((byte, index) => bytes[index] === byte);
}

export async function readDocumentBytes(handle: WritableFileHandle): Promise<OpenedFileBytes> {
  const file = await handle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const native = isPortableDocument(bytes);
  return {
    kind: native ? "native" : "legacy",
    bytes,
    ...(native ? {} : { source: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }),
    fileName: file.name,
    handle,
    lastModified: file.lastModified,
    size: file.size,
  };
}

export async function readFileSnapshot(handle: WritableFileHandle): Promise<FileSnapshot> {
  const file = await handle.getFile();
  return { source: await file.text(), lastModified: file.lastModified, size: file.size };
}

export async function readPlantUmlDocument(handle: WritableFileHandle): Promise<OpenedDocument> {
  const file = await handle.getFile();
  return {
    source: await file.text(),
    fileName: file.name,
    handle,
    lastModified: file.lastModified,
    size: file.size,
  };
}

export function registerLaunchFileConsumer(
  onOpen: (document: OpenedDocument) => void | Promise<void>,
  onError: (error: unknown) => void,
): boolean {
  const launchQueue = (window as FilePickerWindow).launchQueue;
  if (!launchQueue) return false;
  launchQueue.setConsumer((params) => {
    for (const handle of params.files) void readPlantUmlDocument(handle).then(onOpen).catch(onError);
  });
  return true;
}

export function registerDocumentLaunchConsumer(
  onOpen: (document: OpenedFileBytes) => void | Promise<void>,
  onError: (error: unknown) => void,
): boolean {
  const launchQueue = (window as FilePickerWindow).launchQueue;
  if (!launchQueue) return false;
  launchQueue.setConsumer((params) => {
    for (const handle of params.files) void readDocumentBytes(handle).then(onOpen).catch(onError);
  });
  return true;
}

const pickerTypes = [
  {
    description: "PlantUML Ultimate document",
    accept: { "application/octet-stream": [".pumlu"] },
  },
  {
    description: "PlantUML source",
    accept: { "text/plain": [".puml", ".plantuml"] },
  },
];

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function fallbackUpload(): Promise<OpenedDocument | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".puml,.plantuml,text/plain";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(undefined);
        return;
      }
      void file.text().then(
        (source) => resolve({ source, fileName: file.name }),
        () => resolve(undefined),
      );
    };
    input.click();
  });
}

function fallbackDocumentUpload(): Promise<OpenedFileBytes | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pumlu,.puml,.plantuml,application/octet-stream,text/plain";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(undefined);
      void file.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        const native = isPortableDocument(bytes);
        resolve({
          kind: native ? "native" : "legacy", bytes,
          ...(native ? {} : { source: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }),
          fileName: file.name, lastModified: file.lastModified, size: file.size,
        });
      }, () => resolve(undefined));
    };
    input.click();
  });
}

export async function openDocumentFile(): Promise<OpenedFileBytes | undefined> {
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showOpenFilePicker) return fallbackDocumentUpload();
  try {
    const [handle] = await pickerWindow.showOpenFilePicker({ multiple: false, types: pickerTypes });
    return handle ? await readDocumentBytes(handle) : undefined;
  } catch (error) {
    if (cancelled(error)) return undefined;
    throw error;
  }
}

export async function openPlantUmlDocument(): Promise<OpenedDocument | undefined> {
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showOpenFilePicker) return fallbackUpload();
  try {
    const [handle] = await pickerWindow.showOpenFilePicker({ multiple: false, types: pickerTypes });
    if (!handle) return undefined;
    return await readPlantUmlDocument(handle);
  } catch (error) {
    if (cancelled(error)) return undefined;
    throw error;
  }
}

export async function openWorkspaceBackupFile(): Promise<string | undefined> {
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showOpenFilePicker) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(undefined);
          return;
        }
        void file.text().then(resolve, () => resolve(undefined));
      };
      input.click();
    });
  }
  try {
    const [handle] = await pickerWindow.showOpenFilePicker({
      multiple: false,
      types: [{ description: "PlantUML Ultimate backup", accept: { "application/json": [".json"] } }],
    });
    if (!handle) return undefined;
    return await (await handle.getFile()).text();
  } catch (error) {
    if (cancelled(error)) return undefined;
    throw error;
  }
}

export async function writePlantUmlDocument(handle: WritableFileHandle, source: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(source);
  await writable.close();
}

export async function writeDocumentBytes(handle: WritableFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}

export async function savePortableDocumentAs(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<{ fileName: string; handle?: WritableFileHandle; downloaded: boolean } | undefined> {
  const name = suggestedName.replace(/\.(?:pumlu|puml|plantuml)$/i, "") + ".pumlu";
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showSaveFilePicker) {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return { fileName: name, downloaded: true };
  }
  try {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName: name,
      types: [pickerTypes[0]],
    });
    await writeDocumentBytes(handle, bytes);
    return { fileName: handle.name, handle, downloaded: false };
  } catch (error) {
    if (cancelled(error)) return undefined;
    throw error;
  }
}

export function downloadText(contents: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function savePlantUmlDocumentAs(
  source: string,
  suggestedName: string,
): Promise<{ fileName: string; handle?: WritableFileHandle } | undefined> {
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showSaveFilePicker) {
    downloadText(source, suggestedName, "text/plain;charset=utf-8");
    return { fileName: suggestedName };
  }
  try {
    const handle = await pickerWindow.showSaveFilePicker({ suggestedName, types: pickerTypes });
    await writePlantUmlDocument(handle, source);
    return { fileName: handle.name, handle };
  } catch (error) {
    if (cancelled(error)) return undefined;
    throw error;
  }
}

export function svgFileName(fileName: string): string {
  return fileName.replace(/\.(pumlu|puml|plantuml)$/i, "") + ".svg";
}

export function pngFileName(fileName: string): string {
  return fileName.replace(/\.(pumlu|puml|plantuml)$/i, "") + ".png";
}

export async function downloadSvgAsPng(svg: string, fileName: string, scale = 2): Promise<void> {
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG export is not supported by this browser");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create PNG"))), "image/png"),
    );
    const pngUrl = URL.createObjectURL(png);
    const anchor = document.createElement("a");
    anchor.href = pngUrl;
    anchor.download = pngFileName(fileName);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
