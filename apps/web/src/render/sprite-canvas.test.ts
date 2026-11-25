import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng, MAX_SPRITE_PIXELS, pngDataUrl, spriteCanvas } from "./sprite-canvas";

function chunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset);
  const result: { type: string; data: Uint8Array }[] = [];
  for (let at = 8; at < png.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    result.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return result;
}

describe("sprite canvas", () => {
  it("writes a PNG that inflates back to the same pixels", () => {
    const width = 3;
    const height = 2;
    const rgba = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 37) % 256);
    const png = encodePng(width, height, rgba);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const parts = chunks(png);
    expect(parts.map((part) => part.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const header = new DataView(parts[0]!.data.buffer, parts[0]!.data.byteOffset);
    expect([header.getUint32(0), header.getUint32(4), parts[0]!.data[8], parts[0]!.data[9]]).toEqual([3, 2, 8, 6]);
    const raw = inflateSync(parts[1]!.data);
    const rows = [0, 1].map((y) => [...raw.subarray(y * 13, (y + 1) * 13)]);
    expect(rows.map((row) => row[0])).toEqual([0, 0]);
    expect(rows.flatMap((row) => row.slice(1))).toEqual([...rgba]);
  });

  it("splits large images over several stored deflate blocks", () => {
    const rgba = new Uint8ClampedArray(200 * 200 * 4).fill(7);
    const raw = inflateSync(chunks(encodePng(200, 200, rgba))[1]!.data);
    expect(raw.length).toBe(200 * (200 * 4 + 1));
  });

  it("gives a data: URL and refuses oversized or empty sprites", () => {
    expect(pngDataUrl(1, 1, new Uint8Array(4))).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    const canvas = spriteCanvas(() => ({}));
    const context = canvas.getContext();
    expect(() => context.createImageData(MAX_SPRITE_PIXELS, 2)).toThrow(/supported rendering limits/);
    expect(() => context.createImageData(0, 4)).toThrow(/Invalid sprite size/);
    expect(() => canvas.toDataURL()).toThrow(/Nothing was drawn/);
  });

  it("draws through createImageData/putImageData and keeps text measurement from the base context", () => {
    const base = { font: "10px sans-serif", measureText: () => ({ width: 5 }) };
    const canvas = spriteCanvas(() => base);
    const context = canvas.getContext();
    expect(context.measureText().width).toBe(5);
    const image = context.createImageData(2, 1);
    image.data.set([255, 0, 0, 255, 0, 0, 255, 128]);
    context.putImageData(image);
    expect(canvas.toDataURL()).toMatch(/^data:image\/png;base64,/);
  });
});
