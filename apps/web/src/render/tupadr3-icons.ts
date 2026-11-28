// Regenerates tupadr3 icon files from the packed buckets under stdlib/tupadr3/ (written by
// scripts/update-tupadr3-stdlib.mjs). Pure and synchronous: nothing here reads a file or the network. The caller
// loads a bucket (a JSON object name -> entry) and passes the entry in.
//
// Upstream, every icon is one .puml file: one 4-bit grayscale sprite, then four macros and a skinparam line that
// follow a fixed pattern. The bucket keeps only the sprite, as PlantUML's own `z` data (one byte per pixel,
// raw deflate, PlantUML's 6-bit alphabet), plus anything that breaks the pattern. This module undoes that and
// returns the upstream text exactly.
import { inflateSync } from "fflate";

/** An icon that follows the pattern is just its `z` data (a 48x48 sprite named like the file). */
export type Tupadr3Entry = string | Tupadr3Exception;

/** An icon that deviates from the pattern; only the deviating fields are present. */
export interface Tupadr3Exception {
  /** The sprite as `z` data. Absent when `raw` carries the whole file. */
  z?: string;
  /** Sprite width and height, when not 48. */
  w?: number;
  h?: number;
  /** Sprite name, when it differs from the file name. */
  sprite?: string;
  /** Everything after the sprite block (macros, skinparam, `@enduml`), when it differs from the pattern. */
  tail?: string;
  /** The whole file, when it does not even have the sprite-then-macros shape. */
  raw?: string;
}

export interface Tupadr3SetInfo {
  /** The macro prefix, for example `FA5` in `FA5_USER`. */
  prefix: string;
}

export const TUPADR3_SETS: Readonly<Record<string, Tupadr3SetInfo>> = {
  "font-awesome-5": { prefix: "FA5" },
  material: { prefix: "MATERIAL" },
};

const DEFAULT_SIZE = 48;
const Z_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const HEX = "0123456789ABCDEF";

/**
 * The bucket (and file name part) of an icon: by first character, with small letters merged. Characters other
 * than 0-9, a-z fall into the first bucket. Must match the same rule in scripts/update-tupadr3-stdlib.mjs.
 */
const BUCKET_GROUPS = ["0a", "b", "c", "de", "f", "gh", "ik", "l", "mo", "p", "qr", "s", "tu", "vz"] as const;

export const TUPADR3_BUCKETS: readonly string[] = BUCKET_GROUPS;

export function tupadr3Bucket(name: string): string {
  const first = name.charAt(0);
  if (first >= "0" && first <= "9") return "0a";
  for (const group of BUCKET_GROUPS) {
    if (group.length === 1 ? first === group : first >= group.charAt(0) && first <= group.charAt(1)) return group;
  }
  return "0a";
}

/** The `z` text (rows joined with no separator, or with newlines) back to the pixel bytes (0 to 15). */
export function decodeZ(text: string): Uint8Array {
  const bytes: number[] = [];
  let bits = 0;
  let count = 0;
  for (const char of text) {
    const value = Z_ALPHABET.indexOf(char);
    if (value < 0) continue;
    bits = (bits << 6) | value;
    count += 6;
    if (count >= 8) {
      count -= 8;
      bytes.push((bits >> count) & 255);
      bits &= (1 << count) - 1;
    }
  }
  return inflateSync(Uint8Array.from(bytes), {});
}

/** `z` data for pixel bytes, as the script writes it: raw deflate is supplied by the caller. */
export function encodeZ(packed: Uint8Array): string {
  let text = "";
  for (let i = 0; i < packed.length; i += 3) {
    const a = packed[i]!;
    const b = packed[i + 1] ?? 0;
    const c = packed[i + 2] ?? 0;
    text += Z_ALPHABET[a >> 2]! + Z_ALPHABET[((a & 3) << 4) | (b >> 4)]!;
    if (i + 1 < packed.length) text += Z_ALPHABET[((b & 15) << 2) | (c >> 6)]!;
    if (i + 2 < packed.length) text += Z_ALPHABET[c & 63]!;
  }
  return text;
}

/** The pixel bytes as the plain sprite rows, one hex digit per pixel. */
export function pixelsToRows(pixels: Uint8Array, width: number, height: number): string[] {
  if (pixels.length !== width * height)
    throw new Error(`Sprite data has ${pixels.length} pixels, expected ${width * height}`);
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) row += HEX.charAt(pixels[y * width + x]! & 15);
    rows.push(row);
  }
  return rows;
}

/** The macro lines, skinparam line and `@enduml` that every upstream icon ends with (no trailing newline). */
export function defaultTail(prefix: string, name: string, sprite: string = name): string {
  const upper = name.toUpperCase();
  const macro = `${prefix}_${upper}`;
  const stereotype = `${prefix} ${upper}`;
  return [
    `!define ${macro}(_alias) ENTITY(rectangle,black,${sprite},_alias,${stereotype})`,
    `!define ${macro}(_alias, _label) ENTITY(rectangle,black,${sprite},_label, _alias,${stereotype})`,
    `!define ${macro}(_alias, _label, _shape) ENTITY(_shape,black,${sprite},_label, _alias,${stereotype})`,
    `!define ${macro}(_alias, _label, _shape, _color) ENTITY(_shape,_color,${sprite},_label, _alias,${stereotype})`,
    `skinparam folderBackgroundColor<<${stereotype}>> White`,
    "@enduml",
  ].join("\n");
}

/** The exact text of the upstream `<set>/<name>.puml`. */
export function regenerateTupadr3Icon(set: string, name: string, entry: Tupadr3Entry): string {
  const info = TUPADR3_SETS[set];
  if (!info) throw new Error(`Unknown tupadr3 set: ${set}`);
  const detail: Tupadr3Exception = typeof entry === "string" ? { z: entry } : entry;
  if (detail.raw !== undefined) return detail.raw;
  if (detail.z === undefined) throw new Error(`Icon ${set}/${name} has no sprite data`);
  const width = detail.w ?? DEFAULT_SIZE;
  const height = detail.h ?? DEFAULT_SIZE;
  const sprite = detail.sprite ?? name;
  const rows = pixelsToRows(decodeZ(detail.z), width, height);
  const head = `@startuml\nsprite $${sprite} [${width}x${height}/16] {\n${rows.join("\n")}\n}\n\n\n`;
  return head + (detail.tail ?? defaultTail(info.prefix, name, sprite));
}
