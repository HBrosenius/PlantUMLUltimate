import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_EXPANDED_CHARS,
  MAX_INCLUDE_DEPTH,
  expandIncludes,
  originOfLine,
  prepareIncludes,
  refreshIncludes,
  resolveRelativePath,
  type IncludeContext,
  type IncludeFileScope,
} from "./includes";
import { libraryNameForTarget, loadBundledLibraryFile } from "./include-library";
import { planForPlantUmlRenderer, sourceForPlantUmlRenderer } from "./plantuml-source";
import { mapSyntaxErrorToSource, syntaxErrorLocation } from "./syntax-error";

async function expand(source: string, context?: IncludeContext) {
  await prepareIncludes(source, context);
  return expandIncludes(source, context);
}

const docs = (entries: Record<string, string>): IncludeContext => ({
  documents: Object.entries(entries).map(([name, source]) => ({ name, source })),
});

const wrap = (body: string) => `@startuml\n${body}\n@enduml`;

function repository(files: Record<string, string>, path: string) {
  const read = vi.fn(async (requested: string) => {
    const text = files[requested];
    if (text === undefined) throw new Error(`${requested} wasn't found in the repository.`);
    return text;
  });
  const scope: IncludeFileScope = {
    kind: "repository",
    scope: `test:${Math.random()}`,
    path,
    description: "octo/diagrams at main",
    read,
  };
  return { scope, read, context: { files: scope } satisfies IncludeContext };
}

beforeEach(() => refreshIncludes());

describe("resolveRelativePath", () => {
  it("resolves against a directory and stays inside the root", () => {
    expect(resolveRelativePath("docs", "style.puml")).toBe("docs/style.puml");
    expect(resolveRelativePath("docs", "../common/style.puml")).toBe("common/style.puml");
    expect(resolveRelativePath("docs/a", "./../b/./c.puml")).toBe("docs/b/c.puml");
    expect(resolveRelativePath("docs", "/lib/x.puml")).toBe("lib/x.puml");
    expect(resolveRelativePath("docs", "..\\common\\x.puml")).toBe("common/x.puml");
  });

  it("refuses anything above the root, drives, encoded dots and control characters", () => {
    expect(resolveRelativePath("docs", "../../x.puml")).toBeUndefined();
    expect(resolveRelativePath("", "../x.puml")).toBeUndefined();
    expect(resolveRelativePath("docs", "../../../etc/passwd")).toBeUndefined();
    expect(resolveRelativePath("docs", "C:/x.puml")).toBeUndefined();
    expect(resolveRelativePath("docs", "%2e%2e/%2e%2e/x.puml")).toBeUndefined();
    expect(resolveRelativePath("docs", "a\u0000b.puml")).toBeUndefined();
    expect(resolveRelativePath("docs", "")).toBeUndefined();
  });
});

describe("the bundled C4 library", () => {
  it("records the release it was copied from, matching the library itself, with its licence", async () => {
    const readme = (await import("./stdlib/C4/README.md?raw")).default as string;
    const licence = (await import("./stdlib/C4/LICENSE?raw")).default as string;
    const tag = readme.match(/Release tag: v(\d+\.\d+\.\d+)/)?.[1];
    expect(tag).toBeTruthy();
    expect(readme).toContain("https://github.com/plantuml-stdlib/C4-PlantUML");
    const core = await loadBundledLibraryFile("C4/C4.puml");
    expect(core).toContain(`!$c4Version  =  "${tag}"`);
    expect(licence).toContain("MIT License");
  });

  it("expands <C4/C4_Container> with its parents, once, and maps lines to the library files", async () => {
    const source = wrap('!include <C4/C4_Container>\nPerson(user, "Customer")\nContainer(web, "Web", "React")');
    const result = await expand(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.text).not.toMatch(/^\s*!include/m);
    expect(result.text).not.toContain('!if %variable_exists("RELATIVE_INCLUDE")');
    expect(result.text).toMatch(/procedure Container\(/i);
    expect(result.text).toMatch(/procedure Person\(/i);
    expect(result.includes.map((entry) => [entry.label, entry.origin, entry.status])).toEqual([
      ["<C4/C4_Container>", "library", "loaded"],
      ["<C4/C4_Context>", "library", "loaded"],
      ["<C4/C4.puml>".replace(".puml", ""), "library", "loaded"],
    ]);
    const lines = result.text.split("\n");
    expect(lines.length).toBe(result.map.file.length);
    const personLine = lines.findIndex((line) => line.startsWith('Person(user, "Customer")')) + 1;
    expect(originOfLine(result.map, personLine)).toMatchObject({ file: { origin: "main" }, line: 3 });
    const procedure = lines.findIndex((line) => /procedure Container\(/i.test(line)) + 1;
    const origin = originOfLine(result.map, procedure);
    expect(origin?.file).toMatchObject({ origin: "library", label: "<C4/C4_Container>" });
    expect(origin?.line).toBeGreaterThan(1);
  });

  it("measures fonts from the authored text, not from the library's macro bodies", async () => {
    const source = wrap('!include <C4/C4_Container>\nPerson(user, "Customer")');
    await prepareIncludes(source, undefined);
    const plan = planForPlantUmlRenderer(source);
    expect(plan.text.length).toBeGreaterThan(50_000);
    expect(plan.atlasText).toContain('Person(user, "Customer")');
    expect(plan.atlasText).toContain("«container»");
    expect(plan.atlasText).not.toContain("procedure");
    expect(plan.atlasText!.length).toBeLessThan(1_000);
    expect(planForPlantUmlRenderer(wrap("A -> B")).atlasText).toBeUndefined();
  });

  it("maps the well-known C4-PlantUML links to the bundled copy, whatever the ref", async () => {
    for (const ref of ["master", "main", "v2.5.0", "refs/tags/v2.14.0"]) {
      const result = await expand(
        wrap(`!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/${ref}/C4_Context.puml`),
      );
      expect(result.diagnostics, ref).toEqual([]);
      expect(result.text, ref).toMatch(/procedure Person\(/i);
    }
    const url = await expand(
      wrap("!includeurl https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml"),
    );
    expect(url.diagnostics).toEqual([]);
  });

  it("only recognises exact links to bundled files; any other URL stays blocked with a message", async () => {
    const blocked = [
      "https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Nope.puml",
      "https://raw.githubusercontent.com/someone-else/C4-PlantUML/master/C4_Context.puml",
      "http://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
      "https://raw.githubusercontent.com.evil.test/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml",
      "https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/sub/C4_Context.puml",
      "https://example.test/lib.puml",
    ];
    for (const url of blocked) {
      expect(libraryNameForTarget(url), url).toBeUndefined();
      const result = await expand(wrap(`!include ${url}\nA -> B`));
      expect(result.diagnostics[0], url).toMatchObject({ kind: "blocked", mainLine: 2 });
      expect(result.diagnostics[0]?.message).toContain("reads from the internet");
      expect(result.text).not.toContain(url);
      expect(result.text).toContain("' remote resource directive blocked by PlantUML Ultimate");
    }
  });

  it("blocks standard library files that are not bundled", async () => {
    const result = await expand(wrap("!include <awslib/AWSCommon>"));
    expect(result.diagnostics[0]).toMatchObject({ kind: "blocked" });
    expect(result.diagnostics[0]?.message).toContain("Only the C4 library is available offline");
  });
});

describe("include forms", () => {
  it("includes another diagram of the document by name, with only its @start…@end body", async () => {
    const context = docs({
      Style: "' a header comment\n@startuml\nskinparam shadowing false\n@enduml\ntrailing",
    });
    const result = await expand(wrap("!include Style\nAlice -> Bob"), context);
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain("skinparam shadowing false");
    expect(result.text).not.toContain("header comment");
    expect(result.text).not.toContain("trailing");
    expect(result.includes[0]).toMatchObject({ origin: "document", label: "Style", status: "loaded" });
    const line = result.text.split("\n").findIndex((text) => text.includes("shadowing")) + 1;
    expect(originOfLine(result.map, line)).toMatchObject({ file: { label: "Style", origin: "document" }, line: 3 });
  });

  it("finds a diagram by name with or without its extension, ignoring case", async () => {
    const context = docs({ "common.puml": "skinparam handwritten true" });
    for (const target of ["common", "Common.puml", '"common"']) {
      const result = await expand(wrap(`!include ${target}`), context);
      expect(result.text, target).toContain("skinparam handwritten true");
    }
  });

  it("whole files without @start are inlined as they are", async () => {
    const result = await expand(wrap("!include Parts"), docs({ Parts: "!procedure Hello()\nA -> B\n!endprocedure" }));
    expect(result.text).toContain("!procedure Hello()");
  });

  it("!include_once skips a second include, !include and !include_many repeat it", async () => {
    const context = docs({ Part: "skinparam x 1" });
    const count = (result: { text: string }) => result.text.split("skinparam x 1").length - 1;
    expect(count(await expand(wrap("!include Part\n!include Part"), context))).toBe(2);
    expect(count(await expand(wrap("!include_many Part\n!include_many Part"), context))).toBe(2);
    const once = await expand(wrap("!include_once Part\n!include_once Part"), context);
    expect(count(once)).toBe(1);
    expect(once.diagnostics).toEqual([]);
  });

  it("!includesub inlines only the named !startsub part", async () => {
    const lib = "!startsub A\nskinparam a 1\n!endsub\n!startsub B\nskinparam b 2\n!endsub\nskinparam rest 3";
    const result = await expand(wrap("!includesub Lib!B"), docs({ Lib: lib }));
    expect(result.text).toContain("skinparam b 2");
    expect(result.text).not.toContain("skinparam a 1");
    expect(result.text).not.toContain("skinparam rest 3");
    const line = result.text.split("\n").findIndex((text) => text.includes("skinparam b 2")) + 1;
    expect(originOfLine(result.map, line)).toMatchObject({ line: 5 });
    const missing = await expand(wrap("!includesub Lib!C"), docs({ Lib: lib }));
    expect(missing.diagnostics[0]?.message).toContain("No !startsub C");
    const unnamed = await expand(wrap("!includesub Lib"), docs({ Lib: lib }));
    expect(unnamed.diagnostics[0]?.kind).toBe("missing");
  });

  it("!include file!N inlines the Nth @start block, and file!ID a block with that id", async () => {
    const lib = "@startuml\nskinparam first 1\n@enduml\n@startuml(id=second)\nskinparam second 2\n@enduml";
    const context = docs({ Lib: lib });
    const first = await expand(wrap("!include Lib!0"), context);
    expect(first.text).toContain("skinparam first 1");
    expect(first.text).not.toContain("skinparam second 2");
    const second = await expand(wrap("!include Lib!1"), context);
    expect(second.text).toContain("skinparam second 2");
    const byId = await expand(wrap("!include Lib!second"), context);
    expect(byId.text).toContain("skinparam second 2");
    const none = await expand(wrap("!include Lib!5"), context);
    expect(none.diagnostics[0]?.message).toContain("No diagram block 5");
  });

  it("turns !startsub and !endsub markers in inlined text into comments", async () => {
    const result = await expand(wrap("!include Lib"), docs({ Lib: "!startsub A\nx\n!endsub" }));
    expect(result.text).not.toMatch(/^!(?:start|end)sub/m);
  });

  it("recurses through nested includes", async () => {
    const context = docs({ A: "!include B\nskinparam a 1", B: "!include C\nskinparam b 2", C: "skinparam c 3" });
    const result = await expand(wrap("!include A"), context);
    const order = ["skinparam c 3", "skinparam b 2", "skinparam a 1"].map((text) => result.text.indexOf(text));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(result.includes.map((entry) => entry.nested)).toEqual([false, true, true]);
    // Errors anywhere below an include are reported on the include line of the diagram.
    expect(new Set(result.includes.map((entry) => entry.mainLine))).toEqual(new Set([2]));
  });

  it("does not treat includes inside block comments as directives", async () => {
    const result = await expand(wrap("/'\n!include Nope\n'/\nA -> B"), docs({}));
    expect(result.diagnostics).toEqual([]);
    expect(result.includes).toEqual([]);
  });
});

describe("missing includes", () => {
  it("names a missing diagram and offers its name to add", async () => {
    const result = await expand(wrap("!include style.puml\nA -> B"), docs({ Other: "x" }));
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: "missing",
        mainLine: 2,
        message: "style.puml isn't in this document.",
        missingDocument: "style",
      }),
    ]);
    expect(result.includes[0]).toMatchObject({ status: "missing" });
  });

  it("explains a file include that has no document, repository or folder to read from", async () => {
    const result = await expand(wrap("!include ../common/style.puml"));
    expect(result.diagnostics[0]).toMatchObject({ kind: "missing" });
    expect(result.diagnostics[0]?.message).toContain("wasn't opened from a repository or folder");
    expect(result.diagnostics[0]?.missingDocument).toBeUndefined();
  });
});

describe("limits and cycles", () => {
  it("reports a cycle instead of looping", async () => {
    const context = docs({ A: "!include B", B: "!include A" });
    const result = await expand(wrap("!include A"), { ...context, name: "Main" });
    const cycle = result.diagnostics.find((item) => item.kind === "cycle");
    expect(cycle?.message).toContain("Main → A → B → A");
    expect(cycle?.mainLine).toBe(2);
  });

  it("does not let a diagram include itself", async () => {
    const context = { ...docs({ Main: "x", Other: "!include Main" }), name: "Main" };
    expect((await expand(wrap("!include Main"), context)).diagnostics[0]?.kind).toBe("cycle");
    expect((await expand(wrap("!include Other"), context)).diagnostics.some((item) => item.kind === "cycle")).toBe(
      true,
    );
  });

  it("stops at depth 16", async () => {
    const entries: Record<string, string> = {};
    for (let index = 0; index < 20; index += 1)
      entries[`d${index}`] = `!include d${index + 1}\nskinparam level${index} 1`;
    entries.d20 = "skinparam deepest 1";
    const result = await expand(wrap("!include d0"), docs(entries));
    expect(result.diagnostics.find((item) => item.kind === "limit")?.message).toContain(`${MAX_INCLUDE_DEPTH} levels`);
    expect(result.text).toContain("skinparam level15 1");
    expect(result.text).not.toContain("skinparam deepest 1");
  });

  it("caps the expanded text at 2 MB", async () => {
    const big = `skinparam fill "${"x".repeat(900_000)}"`;
    const result = await expand(wrap("!include Big\n!include Big\n!include Big\n!include Big"), docs({ Big: big }));
    expect(result.diagnostics.some((item) => item.kind === "limit")).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_EXPANDED_CHARS + 900_100);
    expect(result.text.split("xxxxxxxxxx").length).toBeLessThan(4 * 90_000);
  });
});

describe("blocked forms", () => {
  it("blocks !import, remote themes and environment builtins, and says why", async () => {
    const source = wrap(
      [
        "!import https://example.test/a.zip",
        "!theme plain from https://example.test/themes",
        '!$x = %load_json("data.json")',
        'title %getenv("HOME")',
        "A -> B",
      ].join("\n"),
    );
    const result = await expand(source);
    expect(result.diagnostics.map((item) => [item.kind, item.mainLine])).toEqual([
      ["blocked", 2],
      ["blocked", 3],
      ["blocked", 4],
      ["blocked", 5],
    ]);
    expect(result.diagnostics[2]?.message).toContain("builtin");
    expect(result.text).toContain("A -> B");
    expect(result.text).not.toContain("example.test");
    expect(result.text).not.toContain("getenv");
  });

  it("blocks a directive inside an included diagram too", async () => {
    const result = await expand(wrap("!include Evil"), docs({ Evil: "!include https://example.test/x.puml" }));
    expect(result.diagnostics[0]).toMatchObject({ kind: "blocked", mainLine: 2 });
    expect(result.text).not.toContain("example.test");
  });

  it("the renderer source never contains a file or URL include, even with a context", async () => {
    const source = wrap("!include Part\n!include https://example.test/x\n!include <C4/C4_Context>\nA -> B");
    await prepareIncludes(source, docs({ Part: "skinparam p 1" }));
    const rendered = sourceForPlantUmlRenderer(source, docs({ Part: "skinparam p 1" }));
    expect(rendered).not.toMatch(/^\s*!\s*include/im);
    expect(rendered).not.toContain("example.test");
    expect(rendered).toContain("skinparam p 1");
  });
});

describe("repository and folder includes", () => {
  it("reads a relative include from the origin repository, relative to the file's own folder", async () => {
    const { context, read } = repository(
      { "common/style.puml": "skinparam shadowing false", "docs/local.puml": "skinparam local 1" },
      "docs/flow.puml",
    );
    const result = await expand(wrap("!include ../common/style.puml\n!include local.puml"), context);
    expect(result.diagnostics).toEqual([]);
    expect(read.mock.calls.map((call) => call[0]).sort()).toEqual(["common/style.puml", "docs/local.puml"]);
    expect(result.includes.map((entry) => [entry.label, entry.origin, entry.status])).toEqual([
      ["common/style.puml", "repository", "loaded"],
      ["docs/local.puml", "repository", "loaded"],
    ]);
    expect(result.text).toContain("skinparam shadowing false");
  });

  it("resolves nested includes against the included file's own folder, and reads each file once", async () => {
    const { context, read } = repository(
      {
        "common/style.puml": "!include colors/dark.puml\n!include colors/dark.puml",
        "common/colors/dark.puml": "skinparam dark 1",
      },
      "docs/flow.puml",
    );
    const result = await expand(wrap("!include ../common/style.puml"), context);
    expect(result.diagnostics).toEqual([]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.text.split("skinparam dark 1").length - 1).toBe(2);
    await expand(wrap("!include ../common/style.puml"), context);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("refuses a path above the repository root without reading anything", async () => {
    const { context, read } = repository({}, "docs/flow.puml");
    const result = await expand(wrap("!include ../../secrets.puml\n!include /../x.puml"), context);
    expect(read).not.toHaveBeenCalled();
    expect(result.diagnostics.map((item) => item.kind)).toEqual(["outside", "outside"]);
    expect(result.diagnostics[0]?.message).toContain("outside the repository");
  });

  it("reports a file that can't be read, with the reader's safe message", async () => {
    const { context } = repository({}, "flow.puml");
    const result = await expand(wrap("!include missing.puml"), context);
    expect(result.diagnostics[0]).toMatchObject({
      kind: "failed",
      message: "missing.puml wasn't found in the repository.",
    });
    expect(result.includes[0]).toMatchObject({ status: "failed", origin: "main" });
  });

  it("keeps include text in the in-memory cache until it is refreshed", async () => {
    const { context, read, scope } = repository({ "a.puml": "skinparam a 1" }, "flow.puml");
    await expand(wrap("!include a.puml"), context);
    refreshIncludes("someone else");
    await expand(wrap("!include a.puml"), context);
    expect(read).toHaveBeenCalledTimes(1);
    refreshIncludes(scope.scope);
    await expand(wrap("!include a.puml"), context);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("uses a folder scope the same way", async () => {
    const { scope, read } = repository({ "shared/s.puml": "skinparam s 1" }, "diagrams/x.puml");
    const folder: IncludeFileScope = { ...scope, kind: "folder" };
    const result = await expand(wrap("!include ../shared/s.puml"), { files: folder });
    expect(read).toHaveBeenCalledWith("shared/s.puml");
    expect(result.includes[0]).toMatchObject({ origin: "folder", status: "loaded" });
    expect((await expand(wrap("!include ../../x.puml"), { files: folder })).diagnostics[0]?.message).toContain(
      "outside the folder",
    );
  });
});

describe("themes on the line map", () => {
  it("expands a bundled theme at the directive and maps its lines to the theme", async () => {
    const source = "@startgantt\n!theme blueprint\n[A] lasts 2 days\n@endgantt";
    const result = await expand(source);
    expect(result.text).toContain("' !theme blueprint expanded locally by PlantUML Ultimate");
    expect(result.text.indexOf('!$BGCOLOR = "#003153"')).toBeLessThan(result.text.indexOf("[A] lasts 2 days"));
    const lines = result.text.split("\n");
    const task = lines.findIndex((line) => line.startsWith("[A] lasts")) + 1;
    expect(originOfLine(result.map, task)).toMatchObject({ file: { origin: "main" }, line: 3 });
    const color = lines.findIndex((line) => line.includes('!$BGCOLOR = "#003153"')) + 1;
    expect(originOfLine(result.map, color)?.file).toMatchObject({ origin: "theme", label: "theme blueprint" });
    expect(result.includes[0]).toMatchObject({ origin: "theme", status: "loaded" });
  });

  it("leaves unknown themes alone, and a source with only a theme keeps working through the renderer plan", async () => {
    expect(planForPlantUmlRenderer("@startuml\n!theme custom\n@enduml").text).toBe("@startuml\n!theme custom\n@enduml");
    const source = "@startgantt\n!theme blueprint\n[A] lasts 2 days\n[B] lasts 1 day\n[A] -> [B] -> [A]\n@endgantt";
    await prepareIncludes(source, undefined);
    const plan = planForPlantUmlRenderer(source);
    expect(plan.text).toContain("[A] -> [B]\n[B] -> [A]\n@endgantt");
    expect(plan.map?.file.length).toBe(plan.text.split("\n").length);
  });
});

describe("mapping syntax errors", () => {
  it("names the file and line for an error in included text and keeps main-document lines", async () => {
    const context = docs({ Style: "skinparam ok 1\nthis is wrong\nskinparam ok 2" });
    const source = wrap("!include Style\nA -> B");
    const result = await expand(source, context);
    const failing = result.text.split("\n").findIndex((line) => line === "this is wrong") + 1;
    const mapped = mapSyntaxErrorToSource(`Syntax Error? — line ${failing}: this is wrong`, result.map);
    expect(mapped).toBe("Syntax Error? — line 2 in Style: this is wrong");
    expect(syntaxErrorLocation(mapped)).toEqual({ line: 2, file: "Style", text: "this is wrong" });
    const tail = result.text.split("\n").findIndex((line) => line === "A -> B") + 1;
    expect(mapSyntaxErrorToSource(`Syntax Error? — line ${tail}: A -> B`, result.map)).toBe(
      "Syntax Error? — line 3: A -> B",
    );
    expect(mapSyntaxErrorToSource("Rendering timed out", result.map)).toBe("Rendering timed out");
  });

  it("maps lines after an expanded theme back to the authored line", async () => {
    const source = "@startuml\n!theme cerulean\nA -> B\nbroken line\n@enduml";
    const result = await expand(source);
    const failing = result.text.split("\n").findIndex((line) => line === "broken line") + 1;
    expect(failing).toBeGreaterThan(4);
    expect(mapSyntaxErrorToSource(`Syntax Error? — line ${failing}: broken line`, result.map)).toBe(
      "Syntax Error? — line 4: broken line",
    );
  });
});
