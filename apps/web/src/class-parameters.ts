export interface StructuredClassParameter {
  name: string;
  type: string;
}

export function parseStructuredClassParameters(value: string): StructuredClassParameter[] | undefined {
  if (!value.trim()) return [];
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character && "<([{".includes(character)) depth += 1;
    else if (character && ">)]}".includes(character)) depth = Math.max(0, depth - 1);
    if (index !== value.length && (character !== "," || depth > 0)) continue;
    parts.push(value.slice(start, index).trim());
    start = index + 1;
  }
  const parameters: StructuredClassParameter[] = [];
  for (const part of parts) {
    let colon = -1;
    depth = 0;
    for (let index = 0; index < part.length; index += 1) {
      const character = part[index]!;
      if ("<([{".includes(character)) depth += 1;
      else if (">)]}".includes(character)) depth = Math.max(0, depth - 1);
      else if (character === ":" && depth === 0) {
        colon = index;
        break;
      }
    }
    const name = part.slice(0, colon).trim();
    const type = colon >= 0 ? part.slice(colon + 1).trim() : "";
    if (!/^[A-Za-z_$][\w$.-]*$/.test(name) || !type) return undefined;
    parameters.push({ name, type });
  }
  return parameters;
}

export const serializeStructuredClassParameters = (parameters: StructuredClassParameter[]) =>
  parameters.map((parameter) => `${parameter.name.trim()}: ${parameter.type.trim()}`).join(", ");
