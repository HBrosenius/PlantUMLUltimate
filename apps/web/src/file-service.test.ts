import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openPlantUmlDocument,
  savePlantUmlDocumentAs,
  svgFileName,
  pngFileName,
  writePlantUmlDocument,
  type WritableFileHandle,
} from "./file-service";

function handle(name = "plan.puml", source = "@startgantt\n@endgantt") {
  const write = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  const value: WritableFileHandle = {
    name,
    getFile: vi.fn(async () => ({ name, text: async () => source }) as File),
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
  });
});
