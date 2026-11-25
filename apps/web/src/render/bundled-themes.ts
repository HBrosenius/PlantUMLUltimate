// The 44 official themes total ~390 KB of source. They are loaded on demand so the
// main bundle does not carry them for the many documents that never use `!theme`.
const loaders = import.meta.glob("./themes/puml-theme-*.puml", {
  import: "default",
  query: "?raw",
}) as Record<string, () => Promise<string>>;

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const THEME_NAME = /puml-theme-([^/]+)\.puml$/;

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
