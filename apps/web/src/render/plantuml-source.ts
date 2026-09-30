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
  const lines = source.split(/\r?\n/);
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
  return expandBundledTheme(safeSource);
}
