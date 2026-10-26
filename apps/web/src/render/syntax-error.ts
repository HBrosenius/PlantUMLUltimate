interface SvgRoot {
  textContent: string | null;
  querySelectorAll(selector: string): Iterable<{ textContent: string | null }>;
}

/**
 * The engine reports a syntax error as an SVG that lists "[From textarea (line N) ]", the source up to the
 * failing line and then "Syntax Error?". Pull the line number and offending text out so the message can say
 * which line to fix.
 */
export function describeSyntaxError(
  svg: string,
  parser: { parseFromString(source: string, type: "image/svg+xml"): { documentElement: SvgRoot } },
): string | undefined {
  const root = parser.parseFromString(svg, "image/svg+xml").documentElement;
  const lines = [...root.querySelectorAll("text")].map((node) => node.textContent?.trim() ?? "");
  const text = root.textContent ?? "";
  const marker = text.match(/Syntax Error[?][^\n]*/i)?.[0]?.trim();
  if (!marker) return undefined;
  const lineNumber = text.match(/\(line (\d+)\)/)?.[1];
  const failing = lines
    .map((line, index) => (/^Syntax Error/i.test(line) ? lines[index - 1] : undefined))
    .find(Boolean);
  if (!lineNumber) return marker;
  return `${marker} — line ${lineNumber}${failing ? `: ${failing}` : ""}`;
}

/** Reads the line number and offending text out of the engine's "Syntax Error? … — line N: text" message. */
export function syntaxErrorLocation(error: string | undefined): { line: number; text?: string } | undefined {
  const match = error?.match(/^Syntax Error\?.*? — line (\d+)(?:: (.*))?$/s);
  if (!match) return undefined;
  return { line: Number(match[1]), ...(match[2]?.trim() ? { text: match[2].trim() } : {}) };
}
