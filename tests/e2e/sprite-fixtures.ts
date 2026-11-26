import { deflateRawSync } from "node:zlib";

/**
 * Synthetic PlantUML sprites for performance and export tests. No third-party icon data: every pixel comes from a
 * small deterministic function of the sprite number, so a fixture is the same on every run and every machine,
 * and the sprites differ from each other the way real icons do (shapes with soft edges, not noise).
 */
export type SpriteLevels = 4 | 8 | 16;
export type SpriteEncoding = "plain" | "z";

const Z_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** Gray level 0 to levels-1 for each pixel: a ring and a bar whose size and position depend on the index. */
export function spritePixels(index: number, size = 48, levels: SpriteLevels = 16): number[][] {
  const cx = size / 2 + ((index * 7) % 9) - 4;
  const cy = size / 2 + ((index * 5) % 7) - 3;
  const radius = size * (0.22 + ((index * 3) % 8) / 40);
  const bar = 3 + (index % 6);
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const distance = Math.hypot(x - cx, y - cy);
      const ring = Math.max(0, 1 - Math.abs(distance - radius) / 4);
      const stripe = x > cx - bar && x < cx + bar && y > cy - radius * 1.4 && y < cy + radius * 1.4 ? 0.6 : 0;
      const grain = (((x * 31 + y * 17 + index * 13) % 11) / 11) * 0.12;
      const value = Math.min(1, Math.max(ring, stripe) + grain);
      return Math.min(levels - 1, Math.round(value * (levels - 1)));
    }),
  );
}

/** The z format: one byte per pixel, raw deflate (no zlib header), then PlantUML's 6-bit alphabet, split into rows of 64 characters. */
function zRows(pixels: number[][]): string[] {
  const packed = deflateRawSync(Uint8Array.from(pixels.flat()));
  let text = "";
  for (let i = 0; i < packed.length; i += 3) {
    const a = packed[i]!;
    const b = packed[i + 1] ?? 0;
    const c = packed[i + 2] ?? 0;
    text += Z_ALPHABET[a >> 2]! + Z_ALPHABET[((a & 3) << 4) | (b >> 4)]!;
    if (i + 1 < packed.length) text += Z_ALPHABET[((b & 15) << 2) | (c >> 6)]!;
    if (i + 2 < packed.length) text += Z_ALPHABET[c & 63]!;
  }
  return text.match(/.{1,64}/g) ?? [];
}

/** `sprite $name [WxH/16] { ... }` for sprite number `index`. */
export function spriteSource(
  name: string,
  index: number,
  {
    size = 48,
    levels = 16,
    encoding = "plain",
  }: { size?: number; levels?: SpriteLevels; encoding?: SpriteEncoding } = {},
): string {
  const pixels = spritePixels(index, size, levels);
  const rows =
    encoding === "z"
      ? zRows(pixels)
      : pixels.map((row) => row.map((value) => value.toString(16).toUpperCase()).join(""));
  return `sprite $${name} [${size}x${size}/${levels}${encoding === "z" ? "z" : ""}] {\n${rows.join("\n")}\n}`;
}

/**
 * A component diagram where each of `count` elements shows its own sprite. The first few use the other
 * encodings (an eighth is `/8`, an eighth is `z`) so every writer path is covered in one fixture.
 */
export function componentFixture(count: number): string {
  const lines = ["@startuml", "left to right direction"];
  for (let index = 1; index <= count; index++) {
    const variant = index % 8;
    lines.push(
      spriteSource(`icon${index}`, index, {
        levels: variant === 3 ? 8 : 16,
        encoding: variant === 5 ? "z" : "plain",
      }),
    );
  }
  for (let index = 1; index <= count; index++) lines.push(`rectangle "<$icon${index}> Item ${index}" as R${index}`);
  for (let index = 2; index <= count; index++) if ((index - 1) % 5 !== 0) lines.push(`R${index - 1} --> R${index}`);
  lines.push("@enduml");
  return lines.join("\n");
}

/** The same sprites in a C4 container diagram, one `$sprite=` argument per element. */
export function c4Fixture(count: number): string {
  const lines = ["@startuml", "!include <C4/C4_Container>", "LAYOUT_LEFT_RIGHT()"];
  for (let index = 1; index <= count; index++) lines.push(spriteSource(`icon${index}`, index));
  for (let index = 1; index <= count; index++)
    lines.push(`Container(c${index}, "Service ${index}", "TypeScript", "Does thing ${index}", $sprite="icon${index}")`);
  for (let index = 2; index <= count; index++)
    if ((index - 1) % 5 !== 0) lines.push(`Rel(c${index - 1}, c${index}, "Calls")`);
  lines.push("@enduml");
  return lines.join("\n");
}
