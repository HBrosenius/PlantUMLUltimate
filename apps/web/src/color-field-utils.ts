function stripNonHexHash(part: string): string {
  // PlantUML sometimes spells a named color as "#Orange" (as opposed to a real hex code like
  // "#f97316"). CSS's `background` only accepts "#" followed by hex digits, so drop the "#"
  // when what follows isn't hex, leaving the bare name CSS already understands.
  return /^#[a-z]/i.test(part) && !/^#[0-9a-f]+$/i.test(part) ? part.slice(1) : part;
}

// A raw PlantUML color value can be a bare name ("Orange"), a "#"-prefixed name or real hex
// ("#Orange", "#f97316"), or two shades separated by "/" for a gradient fill ("Coral/Green").
// This normalizes it into something the CSS `background` property can render, for use as a
// live preview swatch. Returns undefined for an empty/unset value.
export function colorFieldBackground(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const [first, second] = trimmed.split("/").map((part) => part.trim());
  if (!first) return undefined;
  return second
    ? `linear-gradient(135deg, ${stripNonHexHash(first)} 50%, ${stripNonHexHash(second)} 50%)`
    : stripNonHexHash(first);
}
