/**
 * Stage mode paints the rendered diagram with the application theme in dark mode.
 *
 * This is preview-only post-processing of the rendered SVG string: it rewrites paint values (fill, stroke,
 * stop/flood colour and CSS colour declarations) and nothing else, so geometry, overlay hit areas, exports and
 * the PlantUML source stay untouched. Near-white paint becomes the surface token, near-black paint becomes the
 * foreground token, and saturated or mid-tone author colours keep their hue.
 */
export interface StageRecolorTokens {
  /** Canvas surface colour, e.g. the dark panel token. */
  surface: string;
  /** Foreground colour for text and strokes, e.g. the dark theme text token. */
  ink: string;
}

type Rgb = readonly [number, number, number];

const NAMED: Record<string, Rgb> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  whitesmoke: [245, 245, 245],
  snow: [255, 250, 250],
  ghostwhite: [248, 248, 255],
};

const PAINT = "fill|stroke|stop-color|flood-color|color";
const ATTRIBUTE = new RegExp(`(^|[\\s"'])(${PAINT})="([^"]*)"`, "g");
const DECLARATION = new RegExp(`(^|[\\s;{"'])(${PAINT})(\\s*:\\s*)([^;"}]+)`, "g");

export function parseCssColor(value: string): Rgb | undefined {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s*!important$/, "");
  if (NAMED[text]) return NAMED[text];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1]!;
    const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(
    text,
  );
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return undefined;
}

function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function chroma([r, g, b]: Rgb): number {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((index) => from[index]! + (to[index]! - from[index]!) * amount) as unknown as Rgb;
}

/** Returns the replacement paint for a colour value, or undefined to keep the author's colour. */
export function recolorPaint(value: string, tokens: StageRecolorTokens): string | undefined {
  const color = parseCssColor(value);
  const surface = parseCssColor(tokens.surface);
  const ink = parseCssColor(tokens.ink);
  if (!color || !surface || !ink) return undefined;
  // Only neutral colours move; a saturated colour is an authored accent.
  if (chroma(color) > 0.08) return undefined;
  const lightness = luminance(color);
  if (lightness >= 0.97) return tokens.surface;
  // Light greys (table bands, lanes) stay slightly lifted from the surface so structure remains readable.
  if (lightness >= 0.88) return toHex(mix(surface, ink, 0.07));
  if (lightness <= 0.15) return tokens.ink;
  return undefined;
}

export function recolorSvgForStage(svg: string, tokens: StageRecolorTokens): string {
  const attribute = (match: string, lead: string, name: string, value: string) => {
    const next = recolorPaint(value, tokens);
    return next ? `${lead}${name}="${next}"` : match;
  };
  const declaration = (match: string, lead: string, name: string, colon: string, value: string) => {
    const next = recolorPaint(value, tokens);
    return next ? `${lead}${name}${colon}${next}` : match;
  };
  return svg.replace(ATTRIBUTE, attribute).replace(DECLARATION, declaration);
}
