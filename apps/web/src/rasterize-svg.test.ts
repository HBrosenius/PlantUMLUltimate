// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rasterizeSvg } from "./file-service";

const createUrl = vi.fn(() => "blob:test-export");
const revokeUrl = vi.fn();
let width = 100;
let decodeFailure = false;
beforeEach(() => {
  width = 100;
  decodeFailure = false;
  createUrl.mockClear();
  revokeUrl.mockClear();
  vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = width;
      naturalHeight = 50;
      src = "";
      async decode() {
        if (decodeFailure) throw new Error("Decode failed");
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("rejects oversized absolute dimensions before creating an image URL or canvas", async () => {
  await expect(rasterizeSvg('<svg width="8200" height="1000"/>')).rejects.toThrow("Choose 1×");
  expect(createUrl).not.toHaveBeenCalled();
});

it("checks decoder-resolved sizes and revokes URLs after decode failure", async () => {
  width = 20000;
  await expect(rasterizeSvg('<svg width="100%" height="100%"/>')).rejects.toThrow("Export SVG");
  expect(revokeUrl).toHaveBeenCalledWith("blob:test-export");
  decodeFailure = true;
  await expect(rasterizeSvg("<svg/>")).rejects.toThrow("Decode failed");
  expect(revokeUrl).toHaveBeenCalledTimes(2);
});

for (const succeeds of [true, false]) {
  it(`releases canvas memory and its URL after encoding ${succeeds ? "succeeds" : "fails"}`, async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ scale: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(succeeds ? new Blob(["png"]) : null),
    );
    const result = rasterizeSvg('<svg width="100" height="50"/>');
    if (succeeds) expect((await result).width).toBe(100);
    else await expect(result).rejects.toThrow("Try a lower scale or export SVG");
    const canvas = getContext.mock.contexts[0] as HTMLCanvasElement;
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(revokeUrl).toHaveBeenCalledWith("blob:test-export");
  });
}
