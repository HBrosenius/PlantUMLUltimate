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

/**
 * Reads the line number and offending text out of the engine's "Syntax Error? … — line N: text" message.
 * An error inside an included file or theme reads "— line N in <file>: text" and has a `file`.
 */
export function syntaxErrorLocation(
  error: string | undefined,
): { line: number; text?: string; file?: string } | undefined {
  const match = error?.match(/^Syntax Error\?.*? — line (\d+)(?: in (.+?))?(?:: (.*))?$/s);
  if (!match) return undefined;
  return {
    line: Number(match[1]),
    ...(match[3]?.trim() ? { text: match[3].trim() } : {}),
    ...(match[2] ? { file: match[2] } : {}),
  };
}

/**
 * The engine draws some errors (an unknown macro, a bad directive) as a picture instead of reporting them:
 * its text starts "[From textarea (line N) ]". Name the file and line the author wrote in that picture.
 */
export function mapErrorPictureToSource(
  svg: string,
  map: { files: Array<{ label: string; origin: string }>; file: number[]; line: number[] },
): string {
  return svg.replace(/\[From textarea \(line (\d+)\) \]/, (whole, number: string) => {
    const index = Number(number) - 1;
    const file = map.files[map.file[index] ?? -1];
    const line = map.line[index];
    if (!file || line === undefined) return whole;
    return file.origin === "main" ? `[From textarea (line ${line}) ]` : `[From ${xmlText(file.label)} (line ${line}) ]`;
  });
}

const xmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The engine counts lines in the text it was given, which has includes and themes expanded. Map the line
 * of a syntax error back to the file it came from: a line of the open diagram keeps its number, a line of
 * an included file or theme becomes "line N in <file>".
 */
export function mapSyntaxErrorToSource(
  error: string,
  map: { files: Array<{ label: string; origin: string }>; file: number[]; line: number[] },
): string {
  const match = error.match(/^(Syntax Error\?.*? — line )(\d+)(.*)$/s);
  if (!match) return error;
  const index = Number(match[2]) - 1;
  const file = map.files[map.file[index] ?? -1];
  const line = map.line[index];
  if (!file || line === undefined) return error;
  if (file.origin === "main") return `${match[1]}${line}${match[3]}`;
  return `${match[1]}${line} in ${file.label}${match[3]}`;
}
