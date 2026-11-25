import {
  BLOCKED_COMMENT,
  RESOURCE_BUILTIN,
  RESOURCE_DIRECTIVE,
  expandIncludes,
  mayContainIncludes,
  type ExpandedSource,
  type IncludeContext,
  type LineMap,
} from "./includes";

/**
 * What the sandboxed engine is given for a source: the text with every include and bundled theme expanded
 * locally, a line map from each line back to its file and line (undefined when nothing was expanded, so
 * line numbers are the authored ones), and what the expansion found.
 */
export interface RenderPlan {
  text: string;
  map: LineMap | undefined;
  includes: ExpandedSource["includes"];
  diagnostics: ExpandedSource["diagnostics"];
  pending: ExpandedSource["pending"];
  /**
   * What the font measurements are built from when the expanded text is mostly bundled library (C4): the
   * library's macro bodies hold thousands of words that are never drawn, and measuring them in every font
   * takes WebKit longer than the render timeout. Text that is missing is measured from its characters.
   */
  atlasText: string | undefined;
}

/** Short texts the C4 library draws itself (stereotypes and legend entries), so they are measured exactly. */
const LIBRARY_TEXT =
  "\n«person» «external_person» «system» «external_system» «container» «external_container» «component» «external_component» «boundary» «enterprise» «node» legend person system container component external boundary";

export function sourceForPlantUmlRenderer(source: string, context?: IncludeContext): string {
  return planForPlantUmlRenderer(source, context).text;
}

export function planForPlantUmlRenderer(source: string, context?: IncludeContext): RenderPlan {
  const expanded = mayContainIncludes(source) ? expandIncludes(source, context) : undefined;
  const guarded = guardLines((expanded?.text ?? source).split(/\r\n|\r|\n/));
  const { lines, map } = gantt(guarded, expanded?.map);
  return {
    text: lines.join("\n"),
    atlasText: map?.files.some((file) => file.origin === "library")
      ? lines.filter((_, index) => map.files[map.file[index] ?? 0]?.origin !== "library").join("\n") + LIBRARY_TEXT
      : undefined,
    map,
    includes: expanded?.includes ?? [],
    diagnostics: expanded?.diagnostics ?? [],
    pending: expanded?.pending ?? [],
  };
}

/** Blocks what could read files or the network and removes note blocks. Keeps the number of lines. */
function guardLines(lines: string[]): string[] {
  let inNote = false;
  return lines.map((line) => {
    if (RESOURCE_DIRECTIVE.test(line) || RESOURCE_BUILTIN.test(line)) return BLOCKED_COMMENT;
    if (/^\s*note\s+(?:bottom|top|left|right)\s*:\s*.+$/i.test(line)) return "' note rendered by PlantUML Ultimate";
    if (/^\s*note\s+(?:bottom|top|left|right)\s*$/i.test(line)) {
      inNote = true;
      return "' note rendered by PlantUML Ultimate";
    }
    if (inNote && /^\s*end\s+note\s*$/i.test(line)) {
      inNote = false;
      return "";
    }
    return inNote ? "" : line;
  });
}

/**
 * The bundled engine accepts pairwise arrows, but not compact Gantt chains. Keep the first edge on its
 * authored line and append the remaining edges at the block's end, so diagnostics for subsequent authored
 * statements stay aligned. Inserted lines are mapped to the block's `@endgantt` line.
 */
function gantt(lines: string[], map: LineMap | undefined): { lines: string[]; map: LineMap | undefined } {
  const kind = lines
    .join("\n")
    .match(/^[ \t]*@start(\w+)\b/im)?.[1]
    ?.toLowerCase();
  if (kind !== "gantt") return { lines, map };
  const result = [...lines];
  const file = map ? [...map.file] : undefined;
  const line = map ? [...map.line] : undefined;
  let index = 0;
  while (index < result.length) {
    if (!/^[ \t]*@startgantt\b/i.test(result[index]!)) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < result.length && !/^[ \t]*@endgantt\b/i.test(result[end]!)) end += 1;
    if (end >= result.length) break;
    // Moving edges out of a macro or conditional would change its meaning. The bundled themes are expanded
    // macros too, but they are not the author's.
    const body = result.slice(index + 1, end);
    const authored = body.filter((_, offset) => {
      const origin = map ? map.files[map.file[index + 1 + offset] ?? 0]?.origin : "main";
      return origin !== "theme";
    });
    if (authored.some((text) => /^[ \t]*!(?!theme\b)/i.test(text))) {
      index = end + 1;
      continue;
    }
    const extraEdges: string[] = [];
    let inComment = false;
    for (let at = index + 1; at < end; at += 1) {
      const text = result[at]!;
      const commented = inComment || text.includes("/'");
      if (text.includes("/'")) inComment = true;
      if (text.includes("'/")) inComment = false;
      if (commented) continue;
      result[at] = text.replace(
        /^([ \t]*)(\[[^\]\n]+\](?:[ \t]*->[ \t]*\[[^\]\n]+\]){2,})([ \t]*(?:'.*)?)$/,
        (_line, indent: string, chain: string, comment: string) => {
          const tasks = chain.match(/\[[^\]\n]+\]/g)!;
          for (let task = 1; task < tasks.length - 1; task += 1)
            extraEdges.push(`${indent}${tasks[task]} -> ${tasks[task + 1]}`);
          return `${indent}${tasks[0]} -> ${tasks[1]}${comment}`;
        },
      );
    }
    if (extraEdges.length) {
      result.splice(end, 0, ...extraEdges);
      if (file && line) {
        file.splice(end, 0, ...extraEdges.map(() => file[end] ?? 0));
        line.splice(end, 0, ...extraEdges.map(() => line[end] ?? 1));
      }
    }
    index = end + extraEdges.length + 1;
  }
  return { lines: result, map: map && file && line ? { files: map.files, file, line } : undefined };
}
