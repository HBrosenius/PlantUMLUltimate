// The engine turns a raster sprite into an <image> by drawing it on a canvas: createImageData, putImageData,
// then toDataURL("image/png"). The renderer worker has no DOM canvas, so this is the whole pixel path in
// plain JavaScript: an RGBA buffer and a PNG writer (stored deflate, no compression). Nothing here decodes
// an image, reads a URL or touches the network; it only turns pixels the engine computed itself into a
// data: URL, which the renderer frame's CSP (img-src data:) already allows.

/** Largest sprite bitmap accepted, in pixels. Real sprites are tens of pixels wide. */
export const MAX_SPRITE_PIXELS = 512 * 512;

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
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function checkSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Invalid sprite size");
  if (width * height > MAX_SPRITE_PIXELS) throw new Error("Sprite exceeds the supported rendering limits");
}

export function encodePng(width: number, height: number, rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  checkSize(width, height);
  // One filter byte (0, none) in front of every scanline.
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const blocks = Math.ceil(raw.length / 65535);
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let at = 2;
  for (let offset = 0; offset < raw.length; offset += 65535) {
    const length = Math.min(65535, raw.length - offset);
    zlib[at++] = offset + length >= raw.length ? 1 : 0;
    zlib[at++] = length & 0xff;
    zlib[at++] = length >>> 8;
    zlib[at++] = ~length & 0xff;
    zlib[at++] = (~length >>> 8) & 0xff;
    zlib.set(raw.subarray(offset, offset + length), at);
    at += length;
  }
  new DataView(zlib.buffer).setUint32(at, adler32(raw));
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
  header.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA, deflate, no filter, no interlace
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
      return pngDataUrl(image.width, image.height, image.data);
    },
  };
}
