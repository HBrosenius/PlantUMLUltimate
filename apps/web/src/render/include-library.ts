// The bundled C4-PlantUML library (see stdlib/C4/README.md). About 135 KB of source, so it is loaded on
// demand, like the bundled themes, and only for diagrams that include it. The files are data: the app
// inlines them into the source and the sandboxed engine renders them. They are never fetched at runtime.
const loaders = import.meta.glob("./stdlib/C4/*.puml", {
  import: "default",
  query: "?raw",
}) as Record<string, () => Promise<string>>;

const LIBRARY_FILE = /stdlib\/(C4\/[^/]+\.puml)$/;

const libraryLoaders = new Map(
  Object.entries(loaders).flatMap(([path, load]) => {
    const name = path.match(LIBRARY_FILE)?.[1];
    return name ? [[name.toLowerCase(), { name, load }] as const] : [];
  }),
);

/** Library files that have been loaded so far; the synchronous expansion only uses these. */
const loadedLibrary = new Map<string, string>();
const pendingLibrary = new Map<string, Promise<string | undefined>>();

/**
 * C4-PlantUML's own files choose between a relative include and a download with
 * `!if %variable_exists("RELATIVE_INCLUDE")`. The expander resolves both branches to the same bundled
 * file, so the wrapper is replaced by the relative include.
 */
const RELATIVE_INCLUDE_WRAPPER =
  /^[ \t]*!if[ \t]+%variable_exists\("RELATIVE_INCLUDE"\)[ \t]*\n[ \t]*(!include[ \t]+\S+)[ \t]*\n[ \t]*!else[ \t]*\n[ \t]*!include[ \t]+\S+[ \t]*\n[ \t]*!endif[ \t]*$/gm;

/**
 * The bundled engine draws no raster images (the renderer worker rejects them), and C4's default person
 * icon is a raster sprite: using it fails the whole render with `createImageData is not a function`. The
 * default is therefore switched off, the same as C4-PlantUML's own `HIDE_PERSON_SPRITE()`. People are
 * still drawn, as boxes marked <<person>>. This is the only change made to the library text.
 */
const DEFAULT_PERSON_SPRITE = '!global $defaultPersonSprite = "person"';
const NO_PERSON_SPRITE = '!global $defaultPersonSprite = ""';

/**
 * Well-known C4-PlantUML links: exactly `https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/<ref>/<file>.puml`
 * for one of the bundled files. The bundled copy is served whatever the `<ref>`; nothing is fetched.
 */
const C4_URL =
  /^https:\/\/raw\.githubusercontent\.com\/plantuml-stdlib\/C4-PlantUML\/(?:refs\/(?:heads|tags)\/)?[A-Za-z0-9._-]+\/([A-Za-z0-9_]+\.puml)$/;

/** Names of the bundled files, such as `C4/C4_Container.puml`, available without loading any of them. */
export const bundledLibraryFileNames: readonly string[] = [...libraryLoaders.values()].map((entry) => entry.name);

export function libraryHasFile(name: string): boolean {
  return libraryLoaders.has(name.toLowerCase());
}

function canonicalName(name: string): string | undefined {
  return libraryLoaders.get(name.toLowerCase())?.name;
}

/**
 * The bundled file an include target names: `C4/C4_Container` (from `<C4/C4_Container>`), or one of the
 * well-known C4-PlantUML links. Undefined for anything else, which stays blocked.
 */
export function libraryNameForTarget(target: string): string | undefined {
  const url = target.match(C4_URL);
  if (url) return canonicalName(`C4/${url[1]}`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const clean = target.replace(/\\/g, "/").replace(/^\.\//, "");
  return canonicalName(/\.puml$/i.test(clean) ? clean : `${clean}.puml`);
}

/** A file referenced from inside a bundled file (`./C4_Context.puml` next to `C4/C4_Container.puml`). */
export function resolveLibraryRelative(dir: string, path: string): string | undefined {
  const clean = path.replace(/\\/g, "/");
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.includes("..")) return undefined;
  return canonicalName(`${dir}/${clean.replace(/^\.\//, "")}`);
}

export function bundledLibraryText(name: string): string | undefined {
  return loadedLibrary.get(name.toLowerCase());
}

/** Loads one bundled library file. Resolves to undefined for an unknown name. */
export function loadBundledLibraryFile(name: string): Promise<string | undefined> {
  const key = name.toLowerCase();
  const loaded = loadedLibrary.get(key);
  if (loaded !== undefined) return Promise.resolve(loaded);
  const entry = libraryLoaders.get(key);
  if (!entry) return Promise.resolve(undefined);
  let pending = pendingLibrary.get(key);
  if (!pending) {
    pending = entry
      .load()
      .then((source) => {
        const text = source
          .replace(/\r\n?/g, "\n")
          .replace(RELATIVE_INCLUDE_WRAPPER, "$1")
          .replace(DEFAULT_PERSON_SPRITE, NO_PERSON_SPRITE);
        loadedLibrary.set(key, text);
        return text;
      })
      .finally(() => pendingLibrary.delete(key));
    pendingLibrary.set(key, pending);
  }
  return pending;
}
