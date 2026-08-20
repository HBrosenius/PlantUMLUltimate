import type { TextRange } from "./model";

export interface SourceEdit {
  range: TextRange;
  text: string;
}

export function applySourceEdits(source: string, edits: readonly SourceEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.range.from - a.range.from);
  let boundary = source.length;
  let result = source;
  for (const edit of ordered) {
    if (edit.range.from < 0 || edit.range.to < edit.range.from || edit.range.to > source.length)
      throw new RangeError("Source edit is outside the document");
    if (edit.range.to > boundary) throw new Error("Source edits must not overlap");
    result = result.slice(0, edit.range.from) + edit.text + result.slice(edit.range.to);
    boundary = edit.range.from;
  }
  return result;
}
