import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openPlantUmlDocument,
  registerLaunchFileConsumer,
  savePlantUmlDocumentAs,
  svgFileName,
  pngFileName,
  writePlantUmlDocument,
  writeDocumentBytes,
  isPortableDocument,
  type WritableFileHandle,
} from "./file-service";

function handle(name = "plan.puml", source = "@startgantt\n@endgantt") {
  const write = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const value: WritableFileHandle = {
    name,
    getFile: vi.fn(async () => ({ name, text: async () => source, arrayBuffer: async () => new TextEncoder().encode(source).buffer }) as File),
    createWritable: vi.fn(async () => ({ write, close })),
  };
  return { value, write, close };
}

afterEach(() => vi.unstubAllGlobals());

describe("PlantUML file integration", () => {
  it("opens source and preserves its writable handle", async () => {
    const file = handle();
    vi.stubGlobal("window", { showOpenFilePicker: vi.fn(async () => [file.value]) });
    await expect(openPlantUmlDocument()).resolves.toEqual({
      source: "@startgantt\n@endgantt",
      fileName: "plan.puml",
      handle: file.value,
    });
  });

  it("opens files delivered to an installed PWA launch queue", async () => {
    const file = handle("launched.plantuml", "@startuml\nAlice -> Bob\n@enduml");
    const onOpen = vi.fn();
    const onError = vi.fn();
    let consumer: ((params: { files: WritableFileHandle[] }) => void) | undefined;
    vi.stubGlobal("window", {
      launchQueue: {
        setConsumer: vi.fn((next) => {
          consumer = next;
        }),
      },
    });

    expect(registerLaunchFileConsumer(onOpen, onError)).toBe(true);
    consumer!({ files: [file.value] });
    await vi.waitFor(() =>
      expect(onOpen).toHaveBeenCalledWith({
        source: "@startuml\nAlice -> Bob\n@enduml",
        fileName: "launched.plantuml",
        handle: file.value,
      }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("writes and closes before reporting a successful Save As", async () => {
    const file = handle("release.plantuml");
    vi.stubGlobal("window", { showSaveFilePicker: vi.fn(async () => file.value) });
    await expect(savePlantUmlDocumentAs("diagram source", "suggested.puml")).resolves.toEqual({
      fileName: "release.plantuml",
      handle: file.value,
    });
    expect(file.write).toHaveBeenCalledWith("diagram source");
    expect(file.close).toHaveBeenCalledOnce();
  });

  it("writes an existing handle and derives export names", async () => {
    const file = handle();
    await writePlantUmlDocument(file.value, "updated");
    expect(file.write).toHaveBeenCalledWith("updated");
    expect(svgFileName("Roadmap.PUML")).toBe("Roadmap.svg");
    expect(pngFileName("Roadmap.plantuml")).toBe("Roadmap.png");
    expect(svgFileName("Roadmap.pumlu")).toBe("Roadmap.svg");
  });

  it("detects native magic and writes binary bytes", async () => {
    expect(isPortableDocument(new TextEncoder().encode("PUMLUDOCrest"))).toBe(true);
    expect(isPortableDocument(new TextEncoder().encode("@startuml"))).toBe(false);
    const file = handle("plan.pumlu");
    const bytes = new Uint8Array([1, 2, 3]);
    await writeDocumentBytes(file.value, bytes);
    expect(file.write).toHaveBeenCalledWith(bytes);
  });
});
