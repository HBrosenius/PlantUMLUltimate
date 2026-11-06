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
export function recolorPaint(value: string, tokens: StageRecolorTokens, property = "fill"): string | undefined {
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
  // Themes draw outlines and arrows in dark greys (not pure black); those must not vanish on the dark surface.
  if (property === "stroke" && lightness <= 0.35) return tokens.ink;
  return undefined;
}

function contrast(a: Rgb, b: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const relative = ([r, g, b2]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b2);
  const x = relative(a);
  const y = relative(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const GROUP_SHAPE_OR_TEXT = /<g\b[^>]*[^/]>|<\/g>|<(rect|ellipse|circle|polygon|path|text)\b[^>]*>/g;
const FILL_ATTRIBUTE = /(\sfill=")([^"]*)(")/;
const FILL_DECLARATION = /(fill\s*:\s*)([^;"}]+)/;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  color: Rgb;
}

function fillOf(tag: string): string | undefined {
  return (FILL_DECLARATION.exec(tag) ?? FILL_ATTRIBUTE.exec(tag))?.[2]?.trim();
}

function numberAttribute(tag: string, name: string): number | undefined {
  const match = new RegExp(`\\s${name}="(-?[\\d.]+)"`).exec(tag);
  return match ? Number(match[1]) : undefined;
}

/** Bounding box of a filled shape from its geometry attributes; undefined when it cannot be derived. */
function shapeBox(tag: string, name: string): Omit<Box, "color"> | undefined {
  if (name === "rect") {
    const x = numberAttribute(tag, "x") ?? 0;
    const y = numberAttribute(tag, "y") ?? 0;
    const width = numberAttribute(tag, "width");
    const height = numberAttribute(tag, "height");
    return width && height ? { left: x, top: y, right: x + width, bottom: y + height } : undefined;
  }
  if (name === "ellipse" || name === "circle") {
    const cx = numberAttribute(tag, "cx");
    const cy = numberAttribute(tag, "cy");
    const rx = numberAttribute(tag, "rx") ?? numberAttribute(tag, "r");
    const ry = numberAttribute(tag, "ry") ?? rx;
    return cx !== undefined && cy !== undefined && rx && ry
      ? { left: cx - rx, top: cy - ry, right: cx + rx, bottom: cy + ry }
      : undefined;
  }
  const source = name === "polygon" ? /\spoints="([^"]*)"/.exec(tag)?.[1] : /\sd="([^"]*)"/.exec(tag)?.[1];
  const numbers = source?.match(/-?\d*\.?\d+/g)?.map(Number);
  if (!numbers || numbers.length < 6) return undefined;
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * Text keeps its author colour unless the recoloured shape behind it would make it hard to read (for example a
 * theme's white-on-dark label whose dark fill the recolouring left alone, or black text on a saturated fill).
 * The shape behind a label is the last-painted filled shape whose bounds contain the text's origin. Text without
 * its own fill inherits the colour of the nearest group that sets one.
 */
function keepTextReadable(svg: string, tokens: StageRecolorTokens): string {
  const surface = parseCssColor(tokens.surface);
  const ink = parseCssColor(tokens.ink);
  if (!surface || !ink) return svg;
  const boxes: Box[] = [];
  let inherited: Rgb | undefined;
  const outer: Array<Rgb | undefined> = [];
  return svg.replace(GROUP_SHAPE_OR_TEXT, (tag, name: string | undefined) => {
    if (!name) {
      if (tag.startsWith("</g")) inherited = outer.pop();
      else {
        outer.push(inherited);
        const groupFill = fillOf(tag);
        const parsed = groupFill ? parseCssColor(groupFill) : undefined;
        if (parsed) inherited = parsed;
      }
      return tag;
    }
    const fill = fillOf(tag);
    const color = fill ? parseCssColor(fill) : undefined;
    if (name !== "text") {
      // Arrowheads are filled with their stroke colour; they are not a label background.
      const stroke = /\sstroke="([^"]*)"/.exec(tag)?.[1]?.trim().toLowerCase();
      const arrowhead = (name === "polygon" || name === "path") && stroke && fill && stroke === fill.toLowerCase();
      if (!color || arrowhead) return tag;
      const box = shapeBox(tag, name);
      if (box && box.right - box.left > 4 && box.bottom - box.top > 4) boxes.push({ ...box, color });
      return tag;
    }
    const textColor = color ?? (fill === undefined ? inherited : undefined);
    if (!textColor) return tag;
    const x = numberAttribute(tag, "x");
    const y = numberAttribute(tag, "y");
    const size = numberAttribute(tag, "font-size") ?? 12;
    let background: Rgb = surface;
    if (x !== undefined && y !== undefined) {
      const probeY = y - size * 0.3;
      const probeX = /text-anchor="(?:middle|end)"/.test(tag) ? x : x + 3;
      for (let index = boxes.length - 1; index >= 0; index -= 1) {
        const box = boxes[index]!;
        if (probeX >= box.left && probeX <= box.right && probeY >= box.top && probeY <= box.bottom) {
          background = box.color;
          break;
        }
      }
    }
    if (contrast(textColor, background) >= 3) return tag;
    const best = contrast(ink, background) >= contrast(surface, background) ? tokens.ink : tokens.surface;
    if (fill === undefined) return tag.replace(/^<text/, `<text fill="${best}"`);
    return tag.replace(FILL_DECLARATION, `$1${best}`).replace(FILL_ATTRIBUTE, `$1${best}$3`);
  });
}

export function recolorSvgForStage(svg: string, tokens: StageRecolorTokens): string {
  const attribute = (match: string, lead: string, name: string, value: string) => {
    const next = recolorPaint(value, tokens, name);
    return next ? `${lead}${name}="${next}"` : match;
  };
  const declaration = (match: string, lead: string, name: string, colon: string, value: string) => {
    const next = recolorPaint(value, tokens, name);
    return next ? `${lead}${name}${colon}${next}` : match;
  };
  return keepTextReadable(svg.replace(ATTRIBUTE, attribute).replace(DECLARATION, declaration), tokens);
}
