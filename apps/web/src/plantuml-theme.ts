export const PLANTUML_THEMES = [
  "amiga",
  "aws-orange",
  "black-knight",
  "bluegray",
  "blueprint",
  "carbon-gray",
  "cerulean",
  "cerulean-outline",
  "cloudscape-design",
  "crt-amber",
  "crt-green",
  "cyborg",
  "cyborg-outline",
  "hacker",
  "lightgray",
  "mars",
  "materia",
  "materia-outline",
  "metal",
  "mimeograph",
  "minty",
  "mono",
  "plain",
  "reddress-darkblue",
  "reddress-darkgreen",
  "reddress-darkorange",
  "reddress-darkred",
  "reddress-lightblue",
  "reddress-lightgreen",
  "reddress-lightorange",
  "reddress-lightred",
  "sandstone",
  "silver",
  "sketchy",
  "sketchy-outline",
  "spacelab",
  "spacelab-white",
  "sunlust",
  "superhero",
  "superhero-outline",
  "toy",
  "united",
  "vibrant",
] as const;

const THEME_DIRECTIVE = /^\s*!theme\s+([a-z0-9_-]+)\s*$/i;
const START_DIRECTIVE = /^\s*@start[a-z]+\b/i;

export function plantUmlTheme(source: string): string | undefined {
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(THEME_DIRECTIVE);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return undefined;
}

export function setPlantUmlTheme(source: string, theme?: string): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const indexes = lines.flatMap((line, index) => (THEME_DIRECTIVE.test(line) ? [index] : []));

  if (!theme) {
    if (!indexes.length) return source;
    return lines.filter((_, index) => !indexes.includes(index)).join(newline);
  }

  const directive = `!theme ${theme}`;
  if (indexes.length) {
    lines[indexes[0]!] = directive;
    for (let index = indexes.length - 1; index > 0; index -= 1) lines.splice(indexes[index]!, 1);
    return lines.join(newline);
  }

  const start = lines.findIndex((line) => START_DIRECTIVE.test(line));
  lines.splice(start >= 0 ? start + 1 : 0, 0, directive);
  return lines.join(newline);
}
