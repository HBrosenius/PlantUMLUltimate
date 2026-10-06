import { CLASS_RELATIONSHIP_PATTERN } from "@plantuml-studio/diagram-class";
import { USECASE_RELATIONSHIP_PATTERN } from "@plantuml-studio/diagram-usecase";

/** Inline note text follows a single colon; member targets use :: instead. */
export function opensNoteBlock(text: string): boolean {
  if (!/^(?:note|hnote|rnote)\b/i.test(text)) return false;
  if (/^note\s+"[^"]*"\s+as\b/i.test(text)) return false;
  const header = text.replace(/"(?:\\.|[^"\\])*"/g, "").replace(/\bof\s+:[^:]+:/i, "of actor");
  return !/(^|[^:]):(?!:)/.test(header);
}

/** Statements that could be outside a missing class or note closer. */
export function isOuterStatement(text: string): boolean {
  if (
    /^[+~#-]?(?:abstract\s+class|abstract|class|interface|enum|annotation|entity|record|dataclass|struct|protocol|exception|metaclass|stereotype|actor|usecase|component|package|namespace|rectangle|node|database|queue|cloud|artifact|file|folder|frame|object|json|together)\b/i.test(
      text,
    )
  )
    return true;
  if (
    /^(?:note|hnote|rnote|skinparam|hide|show|title|caption|header|footer|legend|newpage|!|@start(?:uml|gantt|wbs))\b/i.test(
      text,
    )
  )
    return true;
  const classRelation = text.match(CLASS_RELATIONSHIP_PATTERN);
  const usecaseRelation = text.match(USECASE_RELATIONSHIP_PATTERN);
  return Boolean(
    (classRelation && /[-.]/.test(classRelation[3]!)) || (usecaseRelation && /[-.]/.test(usecaseRelation[2]!)),
  );
}

/** Withhold end-of-diagram brace insertion when subsequent code makes scope uncertain. */
export function hasAmbiguousBraceTail(source: string, from: number, to: number, block: "class" | "package"): boolean {
  const tail = source
    .slice(from, to)
    .replace(/^[ \t]*\/'[\s\S]*?(?:'\/|(?![\s\S]))/gm, (comment) => comment.replace(/[^\r\n]/g, " "));
  const lines = tail.split(/\r?\n/);
  const indent = lines[0]?.match(/^[ \t]*/)?.[0].length ?? 0;
  let note = false;
  let childClosed = false;
  for (const line of lines.slice(1)) {
    const text = line.trim();
    if (!text || text.startsWith("'")) continue;
    if (note) {
      if (/^end\s+note\b/i.test(text)) note = false;
      continue;
    }
    if (/^}\s*$/.test(text)) childClosed = true;
    if (
      block === "package" &&
      childClosed &&
      isOuterStatement(text) &&
      (line.match(/^[ \t]*/)?.[0].length ?? 0) <= indent
    )
      return true;
    if (/^}}+\s*$/.test(text)) return true;
    if (block === "class" && isOuterStatement(text)) return true;
    if (
      block === "package" &&
      /^(?:package|namespace|folder|frame|node|rectangle|together)\b/i.test(text) &&
      (line.match(/^[ \t]*/)?.[0].length ?? 0) <= indent
    )
      return true;
    if (opensNoteBlock(text)) note = true;
  }
  return note;
}
