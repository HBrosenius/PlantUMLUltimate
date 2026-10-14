// The 44 official themes total ~390 KB of source. They are loaded on demand so the
// main bundle does not carry them for the many documents that never use `!theme`.
const loaders = import.meta.glob("./themes/puml-theme-*.puml", {
  import: "default",
  query: "?raw",
}) as Record<string, () => Promise<string>>;

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const THEME_NAME = /puml-theme-([^/]+)\.puml$/;
const THEME_DIRECTIVE = /^\s*!theme\s+([a-z0-9_-]+)\s*$/i;

const themeLoaders = new Map(
  Object.entries(loaders).flatMap(([path, load]) => {
    const name = path.match(THEME_NAME)?.[1];
    return name && name !== "_none_" ? [[name, load]] : [];
  }),
);

/** Names of the themes that can be expanded locally, available without loading any of them. */
export const bundledPlantUmlThemeNames: ReadonlySet<string> = new Set(themeLoaders.keys());

/** Theme sources that have been loaded so far; `expandBundledTheme` only uses these. */
export const bundledPlantUmlThemes = new Map<string, string>();

const pendingThemes = new Map<string, Promise<string | undefined>>();

/** Load one bundled theme's source (without its metadata header), or `undefined` for unknown names. */
export function loadBundledTheme(name: string): Promise<string | undefined> {
  const key = name.toLowerCase();
  const loaded = bundledPlantUmlThemes.get(key);
  if (loaded !== undefined) return Promise.resolve(loaded);
  const load = themeLoaders.get(key);
  if (!load) return Promise.resolve(undefined);
  let pending = pendingThemes.get(key);
  if (!pending) {
    pending = load()
      .then((source) => {
        const theme = source.replace(FRONT_MATTER, "").trim();
        bundledPlantUmlThemes.set(key, theme);
        return theme;
      })
      .finally(() => pendingThemes.delete(key));
    pendingThemes.set(key, pending);
  }
  return pending;
}

/** The bundled theme a source refers to that still needs loading before it can be expanded. */
export function bundledThemeToLoad(source: string): string | undefined {
  for (const line of source.split(/\r?\n/)) {
    const name = line.match(THEME_DIRECTIVE)?.[1]?.toLowerCase();
    if (!name || !bundledPlantUmlThemeNames.has(name)) continue;
    return bundledPlantUmlThemes.has(name) ? undefined : name;
  }
  return undefined;
}

/** Make sure the theme a source refers to is loaded, so `expandBundledTheme` can expand it synchronously. */
export async function prepareBundledTheme(source: string): Promise<void> {
  const name = bundledThemeToLoad(source);
  if (name) await loadBundledTheme(name);
}

export function expandBundledTheme(source: string): string {
  let expanded = false;
  const lines = source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(THEME_DIRECTIVE);
    const bundled = match?.[1] ? bundledPlantUmlThemes.get(match[1].toLowerCase()) : undefined;
    if (!bundled || expanded) return [line];
    expanded = true;
    return [`' !theme ${match![1]} expanded locally by PlantUML Ultimate`, ...bundled.split(/\r?\n/)];
  });
  return expanded ? lines.join("\n") : source;
}
