// The engine turns a raster sprite into an <image> by drawing it on a canvas: createImageData, putImageData,
// then toDataURL("image/png"). The renderer worker has no DOM canvas, so this is the whole pixel path in
// plain JavaScript: an RGBA buffer and a small PNG writer (filtered scanlines, deflate, CRC32). Nothing here
// decodes an image, reads a URL or touches the network; it only turns pixels the engine computed itself into a
// data: URL, which the renderer frame's CSP (img-src data:) already allows.

import { deflateRaw } from "./deflate";

/** Largest sprite bitmap accepted, in pixels. Real sprites are tens of pixels wide. */
export const MAX_SPRITE_PIXELS = 512 * 512;

/** What the sprite path cost during the current render, read by the worker for the preview timing marks. */
export const spriteStats = { sprites: 0, cached: 0, ms: 0, urlChars: 0 };
export function resetSpriteStats() {
  spriteStats.sprites = 0;
  spriteStats.cached = 0;
  spriteStats.ms = 0;
  spriteStats.urlChars = 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552 is the most bytes that can be added before the sums can overflow 32 bits.
  for (let start = 0; start < bytes.length; start += 5552) {
    const end = Math.min(start + 5552, bytes.length);
    for (let i = start; i < end; i++) {
      a += bytes[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function checkSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Invalid sprite size");
  if (width * height > MAX_SPRITE_PIXELS) throw new Error("Sprite exceeds the supported rendering limits");
}

/**
 * The pixels in the smallest PNG colour type that holds them exactly: grey (0) when every pixel is opaque and
 * has equal red, green and blue, grey with alpha (4) when only the colour is grey (what the engine writes for a
 * sprite), RGBA (6) otherwise.
 */
function packPixels(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array) {
  const count = width * height;
  let grey = true;
  let opaque = true;
  for (let i = 0; i < count * 4; i += 4) {
    const red = rgba[i]!;
    if (rgba[i + 1] !== red || rgba[i + 2] !== red) {
      grey = false;
      break;
    }
    if (rgba[i + 3] !== 255) opaque = false;
  }
  if (!grey) return { colorType: 6, bytesPerPixel: 4, pixels: rgba };
  const bytesPerPixel = opaque ? 1 : 2;
  const pixels = new Uint8Array(count * bytesPerPixel);
  for (let i = 0; i < count; i++) {
    pixels[i * bytesPerPixel] = rgba[i * 4]!;
    if (!opaque) pixels[i * bytesPerPixel + 1] = rgba[i * 4 + 3]!;
  }
  return { colorType: opaque ? 0 : 4, bytesPerPixel, pixels };
}

/** Scanlines with a filter byte in front; each row uses whichever of the five PNG filters has the smallest sum. */
function filterScanlines(pixels: Uint8ClampedArray | Uint8Array, stride: number, height: number, bpp: number) {
  const out = new Uint8Array(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const target = y * (stride + 1);
    let bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const x = pixels[row + i]!;
        const a = i >= bpp ? pixels[row + i - bpp]! : 0;
        const b = y > 0 ? pixels[row - stride + i]! : 0;
        const c = i >= bpp && y > 0 ? pixels[row - stride + i - bpp]! : 0;
        let predicted = 0;
        if (type === 1) predicted = a;
        else if (type === 2) predicted = b;
        else if (type === 3) predicted = (a + b) >> 1;
        else if (type === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const value = (x - predicted) & 0xff;
        candidate[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        out[target] = type;
        out.set(candidate, target + 1);
      }
    }
  }
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  checkSize(width, height);
  if (rgba.length < width * height * 4) throw new Error("Invalid sprite size");
  const { colorType, bytesPerPixel, pixels } = packPixels(width, height, rgba);
  const filtered = filterScanlines(pixels, width * bytesPerPixel, height, bytesPerPixel);
  const compressed = deflateRaw(filtered);
  // zlib wrapper: header 0x78 0x9c, the deflate stream, then the Adler-32 of the uncompressed bytes.
  const zlib = new Uint8Array(2 + compressed.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x9c;
  zlib.set(compressed, 2);
  new DataView(zlib.buffer).setUint32(2 + compressed.length, adler32(filtered));
  const png = new Uint8Array(8 + 25 + (12 + zlib.length) + 12);
  const view = new DataView(png.buffer);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let p = 8;
  const chunk = (type: string, data: Uint8Array) => {
    view.setUint32(p, data.length);
    for (let i = 0; i < 4; i++) png[p + 4 + i] = type.charCodeAt(i);
    png.set(data, p + 8);
    view.setUint32(p + 8 + data.length, crc32(png, p + 4, p + 8 + data.length));
    p += 12 + data.length;
  };
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, colorType, 0, 0, 0], 8); // 8 bit, colour type, deflate, adaptive filtering, no interlace
  chunk("IHDR", header);
  chunk("IDAT", zlib);
  chunk("IEND", new Uint8Array(0));
  return png;
}

export function pngDataUrl(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): string {
  const png = encodePng(width, height, rgba);
  let binary = "";
  for (let i = 0; i < png.length; i += 0x8000) binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

// A diagram that uses the same icon many times asks for the same pixels many times (an engine draws every use
// again), so identical bitmaps are encoded once. Entries keep a copy of their pixels and are compared in full, so
// a hash collision can never return another sprite's image. Bounded in entries and in size, oldest first.
const CACHE_MAX_ENTRIES = 256;
const CACHE_MAX_BYTES = 8_000_000;
const CACHE_MAX_ENTRY_BYTES = 262_144;
const urlCache = new Map<string, { width: number; height: number; pixels: Uint8Array; url: string }>();
let urlCacheBytes = 0;

function fingerprint(width: number, height: number, pixels: Uint8ClampedArray | Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < pixels.length; i++) hash = Math.imul(hash ^ pixels[i]!, 0x01000193);
  return `${width}x${height}:${hash >>> 0}`;
}

function samePixels(a: Uint8Array, b: Uint8ClampedArray | Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function cachedPngDataUrl(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): string {
  checkSize(width, height);
  const key = fingerprint(width, height, rgba);
  const hit = urlCache.get(key);
  if (hit && hit.width === width && hit.height === height && samePixels(hit.pixels, rgba)) {
    urlCache.delete(key);
    urlCache.set(key, hit);
    spriteStats.cached += 1;
    return hit.url;
  }
  const url = pngDataUrl(width, height, rgba);
  const bytes = rgba.length + url.length * 2;
  if (bytes <= CACHE_MAX_ENTRY_BYTES) {
    const old = urlCache.get(key);
    if (old) urlCacheBytes -= old.pixels.length + old.url.length * 2;
    urlCache.set(key, { width, height, pixels: Uint8Array.from(rgba), url });
    urlCacheBytes += bytes;
    for (const [oldest, entry] of urlCache) {
      if (urlCache.size <= CACHE_MAX_ENTRIES && urlCacheBytes <= CACHE_MAX_BYTES) break;
      urlCache.delete(oldest);
      urlCacheBytes -= entry.pixels.length + entry.url.length * 2;
    }
  }
  return url;
}

export function clearSpriteCache() {
  urlCache.clear();
  urlCacheBytes = 0;
}

interface PixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * The part of a canvas the engine's sprite code uses. Text measurement stays with `base` (the font atlas or
 * native text context); the pixel buffer and `toDataURL` are the only additions.
 */
export function spriteCanvas<T extends object>(base: () => T) {
  let image: PixelData | undefined;
  return {
    width: 300,
    height: 150,
    getContext() {
      return Object.assign(Object.create(base()) as T, {
        createImageData(width: number, height: number): PixelData {
          checkSize(width, height);
          return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        },
        putImageData(data: PixelData) {
          image = data;
        },
      });
    },
    toDataURL() {
      if (!image) throw new Error("Nothing was drawn");
      const started = performance.now();
      const url = cachedPngDataUrl(image.width, image.height, image.data);
      spriteStats.sprites += 1;
      spriteStats.ms += performance.now() - started;
      spriteStats.urlChars += url.length;
      return url;
    },
  };
}
