import { parseGantt } from "@plantuml-studio/diagram-gantt";

export interface FontAtlas {
  texts: string[];
  fonts: { family: string; size: number; bold: boolean; italic: boolean }[];
  metrics: Float32Array;
}
export const METRIC_FIELDS = 7;
const measurementCache = new Map<string, number[]>();
let measurementCacheBytes = 0;
let measuredFonts: FontFaceSet | undefined;

function clearMeasurements() {
  measurementCache.clear();
  measurementCacheBytes = 0;
}
export function fontFamily(value: string): string {
  const family = value.replace(/["']/g, "").trim().toLowerCase();
  return family === "sansserif" ? "sans-serif" : family === "monospaced" ? "monospace" : family;
}

export async function buildFontAtlas(source: string, cancelled = () => false): Promise<FontAtlas> {
  if (document.fonts && measuredFonts !== document.fonts) {
    measuredFonts?.removeEventListener("loadingdone", clearMeasurements);
    measuredFonts = document.fonts;
    measuredFonts.addEventListener("loadingdone", clearMeasurements);
    clearMeasurements();
  }
  const strings = new Set<string>();
  const add = (text: string) => {
    if (text.length <= 10_000 && strings.size < 5_000) strings.add(text);
  };
  for (let index = 32; index < 127; index++) add(String.fromCharCode(index));
  for (const character of source) add(character);
  const parsed = parseGantt(source);
  parsed.document.tasks.forEach((task) => add(task.label));
  parsed.document.dividers.forEach((divider) => add(divider.label));
  for (const match of source.matchAll(/^\s*title\s+(.+)$/gm)) add(match[1]!);
  for (let number = 0; number <= 100; number++) add(String(number));
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const years = new Set([
    new Date().getFullYear(),
    ...[...source.matchAll(/\b(\d{4})[-/]\d{2}[-/]\d{2}/g)].map((match) => Number(match[1])),
  ]);
  for (const year of years) for (const month of months) add(`${month} ${year}`);
  for (const word of source.matchAll(/[^\s[\]{}()]+/g)) add(word[0]);
  const families = new Set(["sans-serif", "serif", "monospace"]);
  for (const match of source.matchAll(/\b\w*FontName\s+([^\r\n]+)/gi)) {
    if (families.size < 5 && match[1]!.length <= 200) families.add(fontFamily(match[1]!));
  }
  const fonts: FontAtlas["fonts"] = [];
  for (const family of families)
    for (const size of [10, 11, 12, 13, 14, 18, 24])
      for (const bold of [false, true]) for (const italic of [false, true]) fonts.push({ family, size, bold, italic });
  const texts = [...strings];
  const metrics = new Float32Array(fonts.length * texts.length * METRIC_FIELDS);
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("Text measurement is unavailable in this browser");
  let measured = 0;
  let yieldAt = performance.now() + 8;
  for (let fontIndex = 0; fontIndex < fonts.length; fontIndex++) {
    const font = fonts[fontIndex]!;
    context.font = `${font.italic ? "italic " : ""}${font.bold ? "bold " : ""}${font.size}px ${font.family}`;
    for (let textIndex = 0; textIndex < texts.length; textIndex++) {
      if (cancelled()) throw new DOMException("Font measurement cancelled", "AbortError");
      const text = texts[textIndex]!;
      const key = JSON.stringify([context.font, text]);
      let values = measurementCache.get(key);
      if (!values) {
        const metric = context.measureText(text);
        values = [
          Math.round(metric.width),
          Math.round(metric.actualBoundingBoxLeft || 0),
          Math.round(metric.actualBoundingBoxRight || metric.width),
          Math.round(metric.actualBoundingBoxAscent || 0),
          Math.round(metric.actualBoundingBoxDescent || 0),
          Math.round(metric.fontBoundingBoxAscent || font.size * 0.8),
          Math.round(metric.fontBoundingBoxDescent || font.size * 0.2),
        ];
        measurementCache.set(key, values);
        measurementCacheBytes += key.length * 2 + METRIC_FIELDS * 8;
        while (measurementCache.size > 50_000 || measurementCacheBytes > 8_000_000) {
          const oldest = measurementCache.keys().next().value;
          if (oldest === undefined) break;
          measurementCache.delete(oldest);
          measurementCacheBytes -= oldest.length * 2 + METRIC_FIELDS * 8;
        }
      }
      metrics.set(values, (fontIndex * texts.length + textIndex) * METRIC_FIELDS);
      // Yield by time spent, not by entry count: cached entries need very little work,
      // while excessive message turns are particularly costly in WebKit.
      if (++measured % 64 === 0 && performance.now() >= yieldAt) {
        await new Promise<void>((resolve) => {
          const { port1, port2 } = new MessageChannel();
          port1.onmessage = () => {
            port1.close();
            port2.close();
            resolve();
          };
          port2.postMessage(null);
        });
        yieldAt = performance.now() + 8;
      }
    }
  }
  return { texts, fonts, metrics };
}

export function atlasContext(atlas: FontAtlas) {
  const indexes = new Map(atlas.texts.map((text, index) => [text, index]));
  return {
    font: "10px sans-serif",
    measureText(text: string) {
      const specification = this.font.match(/([\d.]+)px\s+(.+)$/);
      const size = Number(specification?.[1] ?? 10);
      if (!Number.isFinite(size) || size <= 0 || size > 512 || text.length > 10_000)
        throw new Error("Text exceeds the supported rendering limits");
      const family = fontFamily(specification?.[2] ?? "sans-serif");
      const bold = /\b(?:bold|[7-9]00)\b/.test(this.font);
      const italic = /\bitalic\b/.test(this.font);
      let fontIndex = atlas.fonts.findIndex(
        (font) => font.size === size && font.family === family && font.bold === bold && font.italic === italic,
      );
      if (fontIndex < 0)
        fontIndex = atlas.fonts.findIndex(
          (font) => font.size === 12 && font.family === family && font.bold === bold && font.italic === italic,
        );
      if (fontIndex < 0)
        fontIndex = atlas.fonts.findIndex(
          (font) => font.size === 12 && font.family === "sans-serif" && font.bold === bold && font.italic === italic,
        );
      const ratio = size / atlas.fonts[fontIndex]!.size;
      const read = (index: number) =>
        [
          ...atlas.metrics.subarray(
            (fontIndex * atlas.texts.length + index) * METRIC_FIELDS,
            (fontIndex * atlas.texts.length + index + 1) * METRIC_FIELDS,
          ),
        ].map((value) => Math.round(value * ratio));
      const exact = indexes.get(text);
      let values: number[];
      if (exact !== undefined) values = read(exact);
      else {
        values = [0, 0, 0, 0, 0, 0, 0];
        for (const character of text) {
          const metric = read(indexes.get(character) ?? indexes.get("?")!);
          values[0]! += metric[0]!;
          for (let field = 3; field < METRIC_FIELDS; field++) values[field] = Math.max(values[field]!, metric[field]!);
        }
        values[2] = values[0]!;
      }
      return {
        width: values[0]!,
        actualBoundingBoxLeft: values[1]!,
        actualBoundingBoxRight: values[2]!,
        actualBoundingBoxAscent: values[3]!,
        actualBoundingBoxDescent: values[4]!,
        fontBoundingBoxAscent: values[5]!,
        fontBoundingBoxDescent: values[6]!,
      };
    },
  };
}
