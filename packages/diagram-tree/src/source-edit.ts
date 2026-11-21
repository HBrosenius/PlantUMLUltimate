import type { TextRange } from "@plantuml-studio/language-core";

/** The smallest single edit that turns `source` into `next` (the common prefix and suffix are kept). */
export const replacementEdit = (source: string, next: string): { range: TextRange; text: string } => {
  let from = 0;
  while (from < source.length && from < next.length && source[from] === next[from]) from += 1;
  let sourceTo = source.length;
  let nextTo = next.length;
  while (sourceTo > from && nextTo > from && source[sourceTo - 1] === next[nextTo - 1]) {
    sourceTo -= 1;
    nextTo -= 1;
  }
  return { range: { from, to: sourceTo }, text: next.slice(from, nextTo) };
};
