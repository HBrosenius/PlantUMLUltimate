import { bundledPlantUmlThemeNames, bundledPlantUmlThemes, loadBundledTheme } from "./bundled-themes";
import {
  bundledLibraryText,
  libraryHasFile,
  libraryNameForTarget,
  loadBundledLibraryFile,
  resolveLibraryRelative,
} from "./include-library";

/**
 * The include expander. The PlantUML engine runs in a sandbox with no files and no network, so every
 * `!include` is resolved here, on text, before the source reaches it. Included text can only come from:
 *
 * - the bundled C4-PlantUML library (`<C4/...>` and the well-known C4-PlantUML links), loaded on demand,
 * - another diagram of the same `.pumlu` document, by name,
 * - the repository or folder the file was opened from (read through the existing Git clients or folder
 *   access by the context's `read`, never by this module),
 * - the bundled themes (`!theme name`).
 *
 * Everything else (other URLs, `!import`, `%load_json`, `%getenv`, ...) stays blocked with a clear message.
 *
 * Like the bundled themes this is two-step: the async `prepareIncludes` loads what is missing, then the
 * synchronous `expandIncludes` produces the text and a line map from every expanded line back to the file
 * and line it came from.
 */

export const MAX_INCLUDE_DEPTH = 16;
export const MAX_EXPANDED_CHARS = 2_000_000;

export type IncludeOrigin = "main" | "library" | "document" | "repository" | "folder" | "theme";

export interface IncludeFile {
  id: string;
  /** What the user sees: a path, a diagram name, `<C4/C4_Container>` or `theme cerulean`. */
  label: string;
  origin: IncludeOrigin;
}

/** For every line of the expanded text: which file (index into `files`) and which line (1-based) it came from. */
export interface LineMap {
  files: IncludeFile[];
  file: number[];
  line: number[];
}

/** Files beside the main file in a repository or opened folder. `read` throws an Error with a safe message. */
export interface IncludeFileScope {
  kind: "repository" | "folder";
  /** Cache namespace, for example `github:octo/diagrams@main`. */
  scope: string;
  /** The main file's path relative to the root, without a leading slash. */
  path: string;
  /** For messages: `octo/diagrams at main`, or the folder name. */
  description: string;
  /**
   * Changes when the text behind the scope changes without a reload (a folder diagram edited in a tab),
   * so cached text is read again. Leave out for a repository, which is read once per session.
   */
  version?: string;
  /** Reads a normalised, root-relative path. */
  read(path: string): Promise<string>;
}

export interface IncludeContext {
  /** The name of this diagram in its `.pumlu` document, so it can't include itself. */
  name?: string;
  /** The other diagrams of the same document. */
  documents?: ReadonlyArray<{ name: string; source: string }>;
  files?: IncludeFileScope;
}

export type IncludeStatus = "loaded" | "pending" | "missing" | "blocked" | "failed";

export interface IncludeEntry {
  /** What the include asked for, as written. */
  target: string;
  origin: IncludeOrigin | "blocked";
  /** A readable name for the included file. */
  label: string;
  status: IncludeStatus;
  message?: string;
  /** The line in the main source whose include (directly or through other includes) caused this one. */
  mainLine: number;
  nested: boolean;
}

export type IncludeDiagnosticKind = "missing" | "blocked" | "failed" | "outside" | "cycle" | "limit";

export interface IncludeDiagnostic {
  kind: IncludeDiagnosticKind;
  message: string;
  /** The line in the main source to mark. */
  mainLine: number;
  /** The include that was asked for, as written. */
  target: string;
  /** Only for a missing diagram name: the name that could be added as a new diagram. */
  missingDocument?: string;
}

/** Something `expandIncludes` needed that isn't loaded yet. */
export interface IncludeLoad {
  key: string;
  load(): Promise<void>;
}

export interface ExpandedSource {
  text: string;
  map: LineMap;
  includes: IncludeEntry[];
  diagnostics: IncludeDiagnostic[];
  pending: IncludeLoad[];
}

/** The line the engine is told when a directive is blocked. Kept identical to the renderer's safety net. */
export const BLOCKED_COMMENT = "' remote resource directive blocked by PlantUML Ultimate";

/**
 * Preprocessor directives that read other files or URLs: every `!include` variant, `!import` and
 * `!theme ... from <location>`. PlantUML tolerates whitespace after the `!`.
 */
export const RESOURCE_DIRECTIVE = /^\s*!\s*(?:include\w*|import\w*)\b|^\s*!\s*theme\b.*\bfrom\b/i;
/**
 * Preprocessor builtins that read files, URLs, the environment or the local file system. These can appear
 * anywhere in a line, so the whole line is blocked.
 */
export const RESOURCE_BUILTIN = /%\s*(?:load_json|getenv|get_env|dirpath|filename\w*|file_exists|dir_exists)\b/i;

const INCLUDE_DIRECTIVE = /^(\s*)!\s*(include(?:_once|_many|url|sub|def)?)\b\s*(.*?)\s*$/i;
const THEME_DIRECTIVE = /^\s*!theme\s+([a-z0-9_-]+)\s*$/i;
const SUB_MARKER = /^\s*!\s*(startsub|endsub)\b/i;
const START_LINE = /^\s*@start\w+/i;
const END_LINE = /^\s*@end\w+/i;
const URL_TARGET = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Quick check, so sources without any include or theme skip expansion completely. */
export function mayContainIncludes(source: string): boolean {
  return /^\s*!\s*(?:include|theme\b)/im.test(source);
}

// -- Paths -----------------------------------------------------------------------------------------

/**
 * Resolves `target` against the directory `baseDir` (root-relative, `""` for the root). A leading `/` means
 * the root. Returns undefined for anything that leaves the root (`..` above it), for drive letters and for
 * control characters, so a Git or folder include can never reach outside its repository or folder.
 */
export function resolveRelativePath(baseDir: string, target: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(target)) return undefined;
  const clean = target.replace(/\\/g, "/").trim();
  if (!clean || /^[a-z]:/i.test(clean)) return undefined;
  const parts = clean.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const segment of clean.split("/")) {
    if (!segment || segment === ".") continue;
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // A segment that isn't valid percent-encoding is used as written.
    }
    if (decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      if (segment === "..") {
        if (parts.length === 0) return undefined;
        parts.pop();
        continue;
      }
      return undefined;
    }
    parts.push(segment);
  }
  return parts.length ? parts.join("/") : undefined;
}

export function directoryOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

// -- External file cache (repository and folder text, kept in memory for the session) --------------

type ExternalState = { state: "loading" } | { state: "loaded"; text: string } | { state: "failed"; message: string };
const externalFiles = new Map<string, ExternalState>();
const listeners = new Set<() => void>();
let cacheVersion = 0;
let refreshVersion = 0;
const scopeId = (scope: IncludeFileScope) => (scope.version ? `${scope.scope}#${scope.version}` : scope.scope);
const externalKey = (scope: string, path: string) => `${scope}\u0000${path}`;

function changed() {
  cacheVersion += 1;
  for (const listener of [...listeners]) listener();
}

/** Subscribes to loads of included text (bundled library parts, Git files, folder files). */
export function subscribeIncludeCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const includeCacheVersion = () => cacheVersion;
/** Changes only when the user asks for included files to be read again. */
export const includeRefreshVersion = () => refreshVersion;

/** Forgets repository and folder text (all of it, or one scope), so the next render reads it again. */
export function refreshIncludes(scope?: string): void {
  refreshVersion += 1;
  for (const key of [...externalFiles.keys()])
    if (!scope || key.startsWith(`${scope}\u0000`) || key.startsWith(`${scope}#`)) externalFiles.delete(key);
  changed();
}

function loadExternal(scope: IncludeFileScope, path: string): IncludeLoad {
  const key = externalKey(scopeId(scope), path);
  return {
    key,
    async load() {
      if (externalFiles.has(key)) return;
      // Text of older versions of this scope is no longer needed.
      if (scope.version)
        for (const other of [...externalFiles.keys()])
          if (other.startsWith(`${scope.scope}#`) && !other.startsWith(`${scopeId(scope)}\u0000`))
            externalFiles.delete(other);
      externalFiles.set(key, { state: "loading" });
      try {
        const text = await scope.read(path);
        externalFiles.set(key, { state: "loaded", text: text.replace(/\r\n?/g, "\n") });
      } catch (error) {
        externalFiles.set(key, {
          state: "failed",
          message: error instanceof Error && error.message ? error.message : `${path} could not be read.`,
        });
      }
      changed();
    },
  };
}

// -- Expansion -------------------------------------------------------------------------------------

type Located = { text: string; line: number };

interface Loaded {
  file: IncludeFile;
  lines: string[];
  /** Sync include resolution inside this file. */
  scope: FileScope;
}

type FileScope =
  | { kind: "main" }
  | { kind: "library"; dir: string }
  | { kind: "document" }
  | { kind: "files"; scope: IncludeFileScope; dir: string };

type Resolution =
  | { status: "ok"; loaded: Loaded; selector: string | undefined }
  | { status: "pending"; load: IncludeLoad; file: IncludeFile }
  | { status: "error"; kind: IncludeDiagnosticKind; message: string; file?: IncludeFile; missingDocument?: string };

function splitSelector(target: string): { path: string; selector?: string } {
  const index = target.lastIndexOf("!");
  if (index <= 0) return { path: target };
  const selector = target.slice(index + 1).trim();
  return selector ? { path: target.slice(0, index).trim(), selector } : { path: target.slice(0, index).trim() };
}

const stripExtension = (name: string) => name.replace(/\.(?:puml|plantuml|pumlu|pu|iuml|wsd)$/i, "");
const nameKey = (name: string) => stripExtension(name.trim()).toLowerCase();
const asLines = (text: string) => text.split(/\r\n|\r|\n/);

/** Blocks everything that would read the network or files, with a message that says why. */
function blockedMessage(target: string): string {
  return /^[a-z]+:\/\//i.test(target)
    ? `This include reads from the internet, which PlantUML Ultimate never does: ${target}`
    : `This include isn't available offline: ${target}`;
}

export function expandIncludes(source: string, context: IncludeContext | undefined): ExpandedSource {
  const mainFile: IncludeFile = { id: "main", label: "this diagram", origin: "main" };
  const files: IncludeFile[] = [mainFile];
  const fileIndex = new Map<string, number>([[mainFile.id, 0]]);
  const outText: string[] = [];
  const outFile: number[] = [];
  const outLine: number[] = [];
  const includes: IncludeEntry[] = [];
  const diagnostics: IncludeDiagnostic[] = [];
  const pending = new Map<string, IncludeLoad>();
  const onceIncluded = new Set<string>();
  let chars = 0;
  let overLimit = false;
  let themeExpanded = false;

  const indexOf = (file: IncludeFile) => {
    let index = fileIndex.get(file.id);
    if (index === undefined) {
      index = files.push(file) - 1;
      fileIndex.set(file.id, index);
    }
    return index;
  };
  const push = (text: string, file: IncludeFile, line: number) => {
    outText.push(text);
    outFile.push(indexOf(file));
    outLine.push(line);
    chars += text.length + 1;
  };
  const documents = new Map<string, { name: string; source: string }>();
  for (const item of context?.documents ?? []) documents.set(nameKey(item.name), item);
  const selfKey = context?.name ? nameKey(context.name) : undefined;

  const mainScope: FileScope = context?.files
    ? { kind: "files", scope: context.files, dir: directoryOf(context.files.path) }
    : context?.documents
      ? { kind: "document" }
      : { kind: "main" };

  function resolve(target: string, scope: FileScope): Resolution {
    const { path, selector } = splitSelector(target.replace(/^"(.*)"$/, "$1").trim());
    // Standard library: <C4/C4_Container>
    const angled = path.match(/^<(.+)>$/);
    if (angled) {
      const name = libraryNameForTarget(angled[1]!);
      if (!name)
        return {
          status: "error",
          kind: "blocked",
          message: `The standard library file <${angled[1]}> isn't bundled with PlantUML Ultimate. Only the C4 library is available offline.`,
        };
      return resolveLibrary(name, selector);
    }
    if (URL_TARGET.test(path)) {
      const name = libraryNameForTarget(path);
      if (name) return resolveLibrary(name, selector);
      return { status: "error", kind: "blocked", message: blockedMessage(path) };
    }
    if (scope.kind === "library") {
      const resolved = resolveLibraryRelative(scope.dir, path);
      if (resolved) return resolveLibrary(resolved, selector);
      return { status: "error", kind: "missing", message: `${path} isn't part of the bundled library.` };
    }
    // A diagram of this document, by name.
    const peer = documents.get(nameKey(path));
    if (peer && scope.kind !== "files") {
      if (nameKey(peer.name) === selfKey && scope.kind === "main")
        return { status: "error", kind: "cycle", message: `${peer.name} can't include itself.` };
      const file: IncludeFile = { id: `document:${nameKey(peer.name)}`, label: peer.name, origin: "document" };
      return { status: "ok", loaded: { file, lines: asLines(peer.source), scope: { kind: "document" } }, selector };
    }
    if (scope.kind === "files") {
      const resolved = resolveRelativePath(scope.dir, path);
      if (!resolved)
        return {
          status: "error",
          kind: "outside",
          message: `${path} points outside ${scope.scope.kind === "repository" ? "the repository" : "the folder"}, which includes can't reach.`,
        };
      const label = resolved;
      const file: IncludeFile = {
        id: `${scope.scope.kind}:${scopeId(scope.scope)}:${resolved}`,
        label,
        origin: scope.scope.kind,
      };
      const state = externalFiles.get(externalKey(scopeId(scope.scope), resolved));
      if (!state || state.state === "loading")
        return { status: "pending", load: loadExternal(scope.scope, resolved), file };
      if (state.state === "failed") return { status: "error", kind: "failed", message: state.message, file };
      return {
        status: "ok",
        loaded: {
          file,
          lines: asLines(state.text),
          scope: { kind: "files", scope: scope.scope, dir: directoryOf(resolved) },
        },
        selector,
      };
    }
    if (scope.kind === "document" || documents.size > 0 || context?.documents) {
      return {
        status: "error",
        kind: "missing",
        message: `${path} isn't in this document.`,
        missingDocument: stripExtension(path),
      };
    }
    return {
      status: "error",
      kind: "missing",
      message: `${path} can't be read: this diagram isn't part of a document that has it, and wasn't opened from a repository or folder.`,
    };
  }

  function resolveLibrary(name: string, selector: string | undefined): Resolution {
    const file: IncludeFile = { id: `library:${name}`, label: `<${name.replace(/\.puml$/, "")}>`, origin: "library" };
    if (!libraryHasFile(name))
      return { status: "error", kind: "missing", message: `${name} isn't part of the bundled library.`, file };
    const text = bundledLibraryText(name);
    if (text === undefined) {
      const load: IncludeLoad = {
        key: `library:${name}`,
        load: () => loadBundledLibraryFile(name).then(changed),
      };
      return { status: "pending", load, file };
    }
    return {
      status: "ok",
      loaded: { file, lines: asLines(text), scope: { kind: "library", dir: name.slice(0, name.lastIndexOf("/")) } },
      selector,
    };
  }

  /** The lines to inline for an include: the `!startsub` part, the Nth `@start` block, the first block, or the file. */
  function select(lines: string[], selector: string | undefined, sub: boolean): Located[] | string {
    const all = lines.map((text, index) => ({ text, line: index + 1 }));
    if (sub) {
      const name = selector ?? "";
      const start = all.findIndex((item) =>
        new RegExp(`^\\s*!\\s*startsub\\s+${escapeRegExp(name)}\\s*$`, "i").test(item.text),
      );
      if (start < 0) return `No !startsub ${name} in that file.`;
      const rest = all.slice(start + 1);
      const end = rest.findIndex((item) => /^\s*!\s*endsub\b/i.test(item.text));
      return end < 0 ? rest : rest.slice(0, end);
    }
    const starts = all.flatMap((item, index) => (START_LINE.test(item.text) ? [index] : []));
    if (selector !== undefined) {
      const wanted = /^\d+$/.test(selector)
        ? starts[Number(selector)]
        : starts.find((index) =>
            new RegExp(`\\(\\s*id\\s*=\\s*${escapeRegExp(selector)}\\s*\\)`, "i").test(all[index]!.text),
          );
      if (wanted === undefined) return `No diagram block ${selector} in that file.`;
      return untilEnd(all, wanted);
    }
    return starts.length ? untilEnd(all, starts[0]!) : all;
  }
  const untilEnd = (all: Located[], start: number) => {
    const rest = all.slice(start + 1);
    const end = rest.findIndex((item) => END_LINE.test(item.text));
    return end < 0 ? rest : rest.slice(0, end);
  };

  function emit(
    lines: Located[],
    file: IncludeFile,
    scope: FileScope,
    depth: number,
    stack: Array<{ key: string; label: string }>,
    mainLineFor: (line: number) => number,
  ) {
    let inBlockComment = false;
    for (const { text, line } of lines) {
      const mainLine = mainLineFor(line);
      if (overLimit) return;
      if (inBlockComment) {
        push(text, file, line);
        if (text.includes("'/")) inBlockComment = false;
        continue;
      }
      if (/\/'/.test(text) && !/'\//.test(text.slice(text.indexOf("/'") + 2))) {
        inBlockComment = true;
        push(text, file, line);
        continue;
      }
      if (SUB_MARKER.test(text)) {
        push(`' ${text.trim()}`, file, line);
        continue;
      }
      const include = text.match(INCLUDE_DIRECTIVE);
      if (include) {
        handleInclude(include[2]!.toLowerCase(), include[3] ?? "", text, file, line, scope, depth, stack, mainLine);
        continue;
      }
      const theme = text.match(THEME_DIRECTIVE);
      if (theme && !themeExpanded && bundledPlantUmlThemeNames.has(theme[1]!.toLowerCase())) {
        handleTheme(theme[1]!, text, file, line, mainLine);
        continue;
      }
      if (RESOURCE_DIRECTIVE.test(text) || RESOURCE_BUILTIN.test(text)) {
        const message =
          /%/.test(text) && RESOURCE_BUILTIN.test(text)
            ? "This builtin reads files or the environment, which PlantUML Ultimate blocks."
            : "This directive reads other files or the internet, which PlantUML Ultimate blocks.";
        diagnostics.push({ kind: "blocked", message, mainLine, target: text.trim() });
        includes.push({
          target: text.trim(),
          origin: "blocked",
          label: text.trim(),
          status: "blocked",
          message,
          mainLine,
          nested: depth > 0,
        });
        push(BLOCKED_COMMENT, file, line);
        continue;
      }
      push(text, file, line);
    }
  }

  function handleTheme(name: string, text: string, file: IncludeFile, line: number, mainLine: number) {
    const key = name.toLowerCase();
    const themeFile: IncludeFile = { id: `theme:${key}`, label: `theme ${key}`, origin: "theme" };
    const body = bundledPlantUmlThemes.get(key);
    if (body === undefined) {
      pending.set(`theme:${key}`, { key: `theme:${key}`, load: () => loadBundledTheme(key).then(changed) });
      push(text, file, line);
      return;
    }
    themeExpanded = true;
    push(`' !theme ${name} expanded locally by PlantUML Ultimate`, file, line);
    asLines(body).forEach((bodyLine, index) => push(bodyLine, themeFile, index + 1));
    // Themes are listed with the other includes.
    includes.push({
      target: text.trim(),
      origin: "theme",
      label: themeFile.label,
      status: "loaded",
      mainLine,
      nested: false,
    });
  }

  function handleInclude(
    directive: string,
    rawTarget: string,
    text: string,
    file: IncludeFile,
    line: number,
    scope: FileScope,
    depth: number,
    stack: Array<{ key: string; label: string }>,
    mainLine: number,
  ) {
    const target = rawTarget.trim();
    const record = (entry: Omit<IncludeEntry, "mainLine" | "nested" | "target">) =>
      includes.push({ target: target || text.trim(), mainLine, nested: depth > 0, ...entry });
    const fail = (
      kind: IncludeDiagnosticKind,
      message: string,
      label: string,
      status: IncludeStatus,
      missingDocument?: string,
    ) => {
      diagnostics.push({ kind, message, mainLine, target, ...(missingDocument ? { missingDocument } : {}) });
      record({ origin: kind === "blocked" ? "blocked" : "main", label, status, message });
      push(BLOCKED_COMMENT, file, line);
    };
    if (!target) return fail("missing", "This include names no file.", "(no file)", "missing");
    if (depth >= MAX_INCLUDE_DEPTH)
      return fail("limit", `Includes are nested more than ${MAX_INCLUDE_DEPTH} levels deep.`, target, "failed");
    if (overLimit) return;
    const resolution = resolve(target, scope);
    if (resolution.status === "pending") {
      pending.set(resolution.load.key, resolution.load);
      record({ origin: resolution.file.origin, label: resolution.file.label, status: "pending" });
      push(`' !include ${target} is loading`, file, line);
      return;
    }
    if (resolution.status === "error")
      return fail(
        resolution.kind,
        resolution.message,
        resolution.file?.label ?? target,
        resolution.kind === "blocked" ? "blocked" : resolution.kind === "missing" ? "missing" : "failed",
        resolution.missingDocument,
      );
    const { loaded, selector } = resolution;
    const sub = directive === "includesub";
    const onceKey = `${loaded.file.id}#${selector ?? ""}`;
    const stackKey = onceKey;
    if (stack.some((item) => item.key === stackKey)) {
      const chain = [...stack.map((item) => item.label), loaded.file.label].join(" → ");
      return fail("cycle", `These includes form a loop: ${chain}.`, loaded.file.label, "failed");
    }
    if (loaded.file.origin === "library" || directive === "include_once") {
      if (onceIncluded.has(onceKey)) {
        push(`' !include ${target} already included`, file, line);
        return;
      }
    }
    onceIncluded.add(onceKey);
    if (sub && selector === undefined)
      return fail("missing", "!includesub needs a name: !includesub file!NAME.", loaded.file.label, "failed");
    const selected = select(loaded.lines, selector, sub);
    if (typeof selected === "string") return fail("missing", selected, loaded.file.label, "failed");
    record({ origin: loaded.file.origin, label: loaded.file.label, status: "loaded" });
    push(`' !include ${target} expanded locally by PlantUML Ultimate`, file, line);
    emit(
      selected,
      loaded.file,
      loaded.scope,
      depth + 1,
      [...stack, { key: stackKey, label: loaded.file.label }],
      () => mainLine,
    );
    if (chars > MAX_EXPANDED_CHARS && !overLimit) {
      overLimit = true;
      diagnostics.push({
        kind: "limit",
        message: `The included text is larger than ${MAX_EXPANDED_CHARS / 1_000_000} MB, so the rest was left out.`,
        mainLine,
        target,
      });
    }
  }

  const mainLines = asLines(source).map((text, index) => ({ text, line: index + 1 }));
  const mainStack = selfKey ? [{ key: `document:${selfKey}#`, label: context?.name ?? "this diagram" }] : [];
  emit(mainLines, mainFile, mainScope, 0, mainStack, (line) => line);

  return {
    text: outText.join("\n"),
    map: { files, file: outFile, line: outLine },
    includes,
    diagnostics,
    pending: [...pending.values()],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Loads everything `expandIncludes` is missing (bundled library parts, themes, repository and folder files)
 * so the synchronous expansion can finish. Nested includes are discovered as their parents load, so this
 * repeats; it stops after the depth limit's worth of rounds.
 */
export async function prepareIncludes(source: string, context: IncludeContext | undefined): Promise<void> {
  if (!mayContainIncludes(source)) return;
  for (let round = 0; round <= MAX_INCLUDE_DEPTH + 1; round += 1) {
    const { pending } = expandIncludes(source, context);
    if (pending.length === 0) return;
    await Promise.all(pending.map((item) => item.load()));
  }
}

/** The original line a line of expanded text came from, for mapping an engine error back to its file. */
export function originOfLine(map: LineMap, expandedLine: number): { file: IncludeFile; line: number } | undefined {
  const index = expandedLine - 1;
  const fileNumber = map.file[index];
  const line = map.line[index];
  if (fileNumber === undefined || line === undefined) return undefined;
  const file = map.files[fileNumber];
  return file ? { file, line } : undefined;
}
