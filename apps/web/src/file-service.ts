export interface WritableFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options: object) => Promise<WritableFileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<WritableFileHandle>;
}

export interface OpenedDocument {
  source: string;
  fileName: string;
  handle?: WritableFileHandle;
}

const pickerTypes = [
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

export async function openPlantUmlDocument(): Promise<OpenedDocument | undefined> {
  const pickerWindow = window as FilePickerWindow;
  if (!pickerWindow.showOpenFilePicker) return fallbackUpload();
  try {
    const [handle] = await pickerWindow.showOpenFilePicker({ multiple: false, types: pickerTypes });
    if (!handle) return undefined;
    const file = await handle.getFile();
    return { source: await file.text(), fileName: file.name, handle };
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
      types: [{ description: "PlantUML Studio backup", accept: { "application/json": [".json"] } }],
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
  return fileName.replace(/\.(puml|plantuml)$/i, "") + ".svg";
}

export function pngFileName(fileName: string): string {
  return fileName.replace(/\.(puml|plantuml)$/i, "") + ".png";
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
