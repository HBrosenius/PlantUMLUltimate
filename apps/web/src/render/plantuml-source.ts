import { expandBundledTheme } from "./bundled-themes";

/**
 * Preprocessor directives that read other files or URLs: every `!include` variant (`!include`,
 * `!includeurl`, `!include_many`, `!include_once`, `!includesub`, `!includedef`, ...), `!import`
 * and `!theme ... from <location>`. PlantUML tolerates whitespace after the `!`.
 */
const RESOURCE_DIRECTIVE = /^\s*!\s*(?:include\w*|import\w*)\b|^\s*!\s*theme\b.*\bfrom\b/i;
/**
 * Preprocessor builtins that read files, URLs, the environment or the local file system. These can
 * appear anywhere in a line (for example in a variable assignment or a label), so the whole line is blocked.
 */
const RESOURCE_BUILTIN = /%\s*(?:load_json|getenv|get_env|dirpath|filename\w*|file_exists|dir_exists)\b/i;

export function sourceForPlantUmlRenderer(source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  let inNote = false;
  const safeSource = lines
    .map((line) => {
      if (RESOURCE_DIRECTIVE.test(line) || RESOURCE_BUILTIN.test(line))
        return "' remote resource directive blocked by PlantUML Ultimate";
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
    })
    .join("\n");
  const diagramKind = safeSource.match(/^[ \t]*@start(\w+)\b/im)?.[1]?.toLowerCase();
  if (diagramKind !== "gantt") return expandBundledTheme(safeSource);
  // The bundled engine accepts pairwise arrows, but not compact Gantt chains.
  // Keep the first edge on its authored line and append the remaining edges at
  // the block's end, so diagnostics for subsequent authored statements stay aligned.
  const compatibleSource = safeSource.replace(
    /^([ \t]*@startgantt\b[^\n]*\n)([\s\S]*?)(^[ \t]*@endgantt\b[^\n]*)/gim,
    (_block, start: string, body: string, end: string) => {
      // Moving edges out of a macro or conditional would change its meaning.
      if (/^[ \t]*!(?!theme\b)/im.test(body)) return _block;
      const extraEdges: string[] = [];
      let inComment = false;
      const compatibleBody = body
        .split("\n")
        .map((line) => {
          const commented = inComment || line.includes("/'");
          if (line.includes("/'")) inComment = true;
          if (line.includes("'/")) inComment = false;
          if (commented) return line;
          return line.replace(
            /^([ \t]*)(\[[^\]\n]+\](?:[ \t]*->[ \t]*\[[^\]\n]+\]){2,})([ \t]*(?:'.*)?)$/,
            (_line, indent: string, chain: string, comment: string) => {
              const tasks = chain.match(/\[[^\]\n]+\]/g)!;
              for (let index = 1; index < tasks.length - 1; index += 1)
                extraEdges.push(`${indent}${tasks[index]} -> ${tasks[index + 1]}`);
              return `${indent}${tasks[0]} -> ${tasks[1]}${comment}`;
            },
          );
        })
        .join("\n");
      return `${start}${compatibleBody}${extraEdges.length ? `${extraEdges.join("\n")}\n` : ""}${end}`;
    },
  );
  return expandBundledTheme(compatibleSource);
}
