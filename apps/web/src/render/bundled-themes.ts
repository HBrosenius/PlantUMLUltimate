const files = import.meta.glob("./themes/puml-theme-*.puml", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const THEME_NAME = /puml-theme-([^/]+)\.puml$/;

export const bundledPlantUmlThemes = new Map(
  Object.entries(files).flatMap(([path, source]) => {
    const name = path.match(THEME_NAME)?.[1];
    return name && name !== "_none_" ? [[name, source.replace(FRONT_MATTER, "").trim()]] : [];
  }),
);

export function expandBundledTheme(source: string): string {
  let expanded = false;
  const lines = source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*!theme\s+([a-z0-9_-]+)\s*$/i);
    const bundled = match?.[1] ? bundledPlantUmlThemes.get(match[1].toLowerCase()) : undefined;
    if (!bundled || expanded) return [line];
    expanded = true;
    return [`' !theme ${match![1]} expanded locally by PlantUML Ultimate`, ...bundled.split(/\r?\n/)];
  });
  return expanded ? lines.join("\n") : source;
}
