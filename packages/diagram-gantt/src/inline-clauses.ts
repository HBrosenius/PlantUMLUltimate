/** Split conjunctions outside task names, resources, quoted values and expressions. */
export function splitGanttClauses(statement: string): Array<{ text: string; from: number }> {
  const clauses: Array<{ text: string; from: number }> = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  const append = (end: number) => {
    const raw = statement.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    clauses.push({ text: raw.trim(), from: start + leading });
  };
  for (let index = 0; index < statement.length; index++) {
    const char = statement[index];
    if (char === '"' && statement[index - 1] !== "\\") quote = !quote;
    if (quote) continue;
    if (char === "[" || char === "{" || char === "(") depth++;
    if (char === "]" || char === "}" || char === ")") depth--;
    if (depth !== 0) continue;
    const delimiter = /^\s+and\s+/i.exec(statement.slice(index));
    if (!delimiter) continue;
    // "2 weeks and 3 days" is one duration, not two statement clauses.
    if (
      /^(?:lasts|requires)\s+\d+\s+weeks?$/i.test(statement.slice(start, index).trim()) &&
      /^\d+\s+days?\b/i.test(statement.slice(index + delimiter[0].length))
    )
      continue;
    append(index);
    index += delimiter[0].length - 1;
    start = index + 1;
  }
  append(statement.length);
  return clauses;
}
