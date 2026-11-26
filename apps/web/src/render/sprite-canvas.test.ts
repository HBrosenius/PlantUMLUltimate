import { inflateSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cachedPngDataUrl,
  clearSpriteCache,
  encodePng,
  MAX_SPRITE_PIXELS,
  pngDataUrl,
  resetSpriteStats,
  spriteCanvas,
  spriteStats,
} from "./sprite-canvas";

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

/** A complete PNG decoder for what the writer makes (8 bit, no interlace): back to RGBA, whatever the colour type. */
function decode(png: Uint8Array) {
  const parts = chunks(png);
  const header = new DataView(parts[0]!.data.buffer, parts[0]!.data.byteOffset);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  const colorType = parts[0]!.data[9]!;
  const channels = { 0: 1, 4: 2, 6: 4 }[colorType as 0 | 4 | 6]!;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts.filter((part) => part.type === "IDAT").map((part) => part.data)));
  expect(raw.length).toBe(height * (stride + 1));
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= channels ? pixels[y * stride + i - channels]! : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
      const c = i >= channels && y > 0 ? pixels[(y - 1) * stride + i - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + i] = (x + predicted) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = pixels.subarray(i * channels, (i + 1) * channels);
    rgba.set(channels === 4 ? p : channels === 2 ? [p[0]!, p[0]!, p[0]!, p[1]!] : [p[0]!, p[0]!, p[0]!, 255], i * 4);
  }
  return { width, height, colorType, rgba };
}

/** What the engine writes for a sprite: one grey value per pixel in all three colour channels, alpha varying. */
function spritePixels(width: number, height: number, seed = 1) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const grey = (Math.abs(x - width / 2) * 5 + Math.abs(y - height / 2) * 3 + seed * 17) % 256;
    rgba.set([grey, grey, grey, (x * 9 + y * 4 + seed) % 256], i * 4);
  }
  return rgba;
}

describe("sprite canvas", () => {
  beforeEach(() => {
    clearSpriteCache();
    resetSpriteStats();
  });

  it("writes an RGBA PNG that inflates back to the same pixels when the colours are not grey", () => {
    const width = 3;
    const height = 2;
    const rgba = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 37) % 256);
    const png = encodePng(width, height, rgba);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(chunks(png).map((part) => part.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const decoded = decode(png);
    expect([decoded.width, decoded.height, decoded.colorType]).toEqual([3, 2, 6]);
    expect([...decoded.rgba]).toEqual([...rgba]);
  });

  it("uses grey with alpha for the engine's sprites and grey for opaque ones, losing nothing", () => {
    const sprite = spritePixels(52, 52);
    const withAlpha = decode(encodePng(52, 52, sprite));
    expect(withAlpha.colorType).toBe(4);
    expect([...withAlpha.rgba]).toEqual([...sprite]);
    const opaque = sprite.slice();
    for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
    const flat = decode(encodePng(52, 52, opaque));
    expect(flat.colorType).toBe(0);
    expect([...flat.rgba]).toEqual([...opaque]);
    // One channel off from grey is enough to need colour.
    const tinted = sprite.slice();
    tinted[1] = tinted[1]! ^ 1;
    expect(decode(encodePng(52, 52, tinted)).colorType).toBe(6);
  });

  it("is smaller than the pixels, and identical input gives identical bytes", () => {
    const sprite = spritePixels(48, 48, 3);
    const first = encodePng(48, 48, sprite);
    expect([...encodePng(48, 48, sprite.slice())]).toEqual([...first]);
    expect(first.length).toBeLessThan((48 * 48 * 4) / 3);
  });

  it("round trips every pixel of images with long runs, noise and one pixel", () => {
    for (const [width, height, make] of [
      [1, 1, () => Uint8Array.of(9, 9, 9, 255)],
      [64, 64, () => new Uint8Array(64 * 64 * 4)],
      [37, 29, () => Uint8Array.from({ length: 37 * 29 * 4 }, (_, i) => ((i * 2654435761) >>> 13) & 0xff)],
      [200, 200, () => new Uint8ClampedArray(200 * 200 * 4).fill(7)],
    ] as const) {
      const rgba = make();
      expect([...decode(encodePng(width, height, rgba)).rgba]).toEqual([...rgba]);
    }
  });

  it("gives a data: URL and refuses oversized or empty sprites", () => {
    expect(pngDataUrl(1, 1, new Uint8Array(4))).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    const canvas = spriteCanvas(() => ({}));
    const context = canvas.getContext();
    expect(() => context.createImageData(MAX_SPRITE_PIXELS, 2)).toThrow(/supported rendering limits/);
    expect(() => context.createImageData(0, 4)).toThrow(/Invalid sprite size/);
    expect(() => canvas.toDataURL()).toThrow(/Nothing was drawn/);
    expect(() => encodePng(4, 4, new Uint8Array(8))).toThrow(/Invalid sprite size/);
    expect(() => cachedPngDataUrl(MAX_SPRITE_PIXELS, 2, new Uint8Array(0))).toThrow(/supported rendering limits/);
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

  it("encodes identical bitmaps once and never mixes up different ones", () => {
    const draw = (rgba: Uint8ClampedArray) => {
      const canvas = spriteCanvas(() => ({}));
      const image = canvas.getContext().createImageData(20, 20);
      image.data.set(rgba);
      canvas.getContext().putImageData(image);
      return canvas.toDataURL();
    };
    const a = spritePixels(20, 20, 1);
    const b = spritePixels(20, 20, 2);
    const first = draw(a);
    expect(draw(a.slice())).toBe(first);
    expect(draw(b)).not.toBe(first);
    expect(draw(a)).toBe(first);
    expect(spriteStats.sprites).toBe(4);
    expect(spriteStats.cached).toBe(2);
    expect(first).toBe(pngDataUrl(20, 20, a));
  });

  it("keeps the cache bounded", () => {
    const distinct = (n: number) => {
      const pixels = new Uint8ClampedArray(8 * 8 * 4);
      pixels[0] = n & 255;
      pixels[4] = n >> 8;
      return pixels;
    };
    for (let n = 0; n < 600; n++) cachedPngDataUrl(8, 8, distinct(n));
    const before = spriteStats.cached;
    cachedPngDataUrl(8, 8, distinct(0)); // long evicted
    expect(spriteStats.cached).toBe(before);
    cachedPngDataUrl(8, 8, distinct(599)); // recent
    expect(spriteStats.cached).toBe(before + 1);
  });
});
