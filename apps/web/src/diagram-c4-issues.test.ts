import { describe, expect, it } from "vitest";
import { C4_MACROS } from "./c4-source";
import { C4_STARTERS } from "./c4-starters";
import { C4_LIBRARY_NAMES, c4BraceIssues, c4QuoteIssues, c4StatementIssues } from "./diagram-c4-issues";
import { analyzeDiagram, diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { loadBundledLibraryFile } from "./render/include-library";

const wrap = (body: string) => `@startuml\n!include <C4/C4_Container>\n${body}\n@enduml`;
const apply = (source: string, fix: { from: number; to: number; replacement?: string } | undefined) =>
  source.slice(0, fix!.from) + fix!.replacement! + source.slice(fix!.to);
const messages = (source: string) => diagnosticsForDiagram("c4", source).map((item) => item.message);

describe("C4 library names", () => {
  it("lists every procedure and function the bundled library defines", async () => {
    const text = (
      await Promise.all(
        ["C4", "C4_Context", "C4_Container", "C4_Component", "C4_Dynamic", "C4_Deployment"].map((name) =>
          loadBundledLibraryFile(`C4/${name}.puml`),
        ),
      )
    ).join("\n");
    const known = new Set([...C4_MACROS.map((item) => item.name), ...C4_LIBRARY_NAMES]);
    // Helpers the library calls itself (`getElementBase`, `breakText`, ...) are not diagram statements, but a user
    // may still call one, and it is not an unknown macro.
    const defined = [...text.matchAll(/^\s*!(?:unquoted\s+)?(?:procedure|function)\s+([A-Za-z_]\w*)/gim)].map(
      (match) => match[1]!,
    );
    const public_ = defined.filter((name) => /^[A-Z]/.test(name) || /^(?:increment|setIndex)$/.test(name));
    expect(public_.filter((name) => !known.has(name))).toEqual([]);
  });
});

describe("C4 quote issues", () => {
  it("finds an unmatched quote in a macro argument and offers to close it", () => {
    const source = wrap('Person(user, "Customer)\nSystem(shop, "Shop")');
    const [issue] = c4QuoteIssues(source);
    expect(issue).toMatchObject({
      message: "Quoted argument has an unmatched quote",
      label: "Add missing closing quote",
    });
    expect(apply(source, issue)).toBe(wrap('Person(user, "Customer")\nSystem(shop, "Shop")'));
  });

  it("reports an ambiguous unmatched quote without a repair", () => {
    const [issue] = c4QuoteIssues(wrap('Container(web, "Web, "React")'));
    expect(issue).toMatchObject({ message: "Quoted argument has an unmatched quote" });
    expect(issue?.replacement).toBeUndefined();
  });

  it("offers a single quote for an escaped quote, which the library can't draw", () => {
    const source = wrap('Person(user, "The \\"boss\\"")');
    const issues = c4QuoteIssues(source);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ replacement: "'", label: "Use a single quote" });
    expect(messages(source).some((message) => message.includes("escaped quote"))).toBe(true);
  });

  it("leaves balanced quotes, apostrophes, comments, notes and procedure bodies alone", () => {
    const source = wrap(
      [
        `Person(user, "O'Brien", "It's fine") ' a "comment`,
        `' Person(a, "never`,
        `/' block "`,
        `Person(b, "x`,
        `'/`,
        `note right of user`,
        `  A " quote`,
        `end note`,
        `!procedure Thing($a)`,
        `Person($a, "open`,
        `!endprocedure`,
      ].join("\n"),
    );
    expect(c4QuoteIssues(source)).toEqual([]);
  });
});

describe("C4 brace issues", () => {
  it("removes a doubled opening brace", () => {
    const source = wrap('System_Boundary(shop, "Shop") {{\n  Container(web, "Web")\n}');
    const [issue] = c4BraceIssues(source);
    expect(issue).toMatchObject({ message: "Block has duplicated opening braces" });
    expect(apply(source, issue!)).toBe(wrap('System_Boundary(shop, "Shop") {\n  Container(web, "Web")\n}'));
  });

  it("removes a second opening brace on the next line", () => {
    const source = wrap('System_Boundary(shop, "Shop") {\n{\n  Container(web, "Web")\n}');
    const [issue] = c4BraceIssues(source);
    expect(apply(source, issue!)).toBe(wrap('System_Boundary(shop, "Shop") {\n  Container(web, "Web")\n}'));
  });

  it("adds the missing brace to an indented block that is closed", () => {
    const source = wrap('System_Boundary(shop, "Shop")\n  Container(web, "Web")\n}');
    const [issue] = c4BraceIssues(source);
    expect(issue).toMatchObject({ message: "Indented block is missing its opening brace" });
    expect(apply(source, issue!)).toBe(wrap('System_Boundary(shop, "Shop") {\n  Container(web, "Web")\n}'));
  });

  it("leaves well formed boundaries and elements alone", () => {
    expect(
      c4BraceIssues(wrap('System_Boundary(shop, "Shop") {\n  Container(web, "Web")\n}\nContainer(db, "DB")')),
    ).toEqual([]);
  });

  it("does not repeat what the C4 language checks already report", () => {
    // An unclosed boundary and a stray } are reported once, by c4-language.
    expect(c4BraceIssues(wrap('System_Boundary(shop, "Shop") {\n  Container(web, "Web")'))).toEqual([]);
    expect(c4BraceIssues(wrap('Container(web, "Web")\n}'))).toEqual([]);
    expect(
      messages(wrap('System_Boundary(shop, "Shop") {\n  Container(web, "Web")')).filter((m) => /never closed/.test(m)),
    ).toHaveLength(1);
  });
});

describe("C4 statement issues", () => {
  it("accepts every macro of the catalog and of the bundled library", () => {
    const calls = C4_MACROS.filter((macro) => !macro.block).map(
      (macro) =>
        `${macro.name}(${macro.params
          .filter((param) => !param.optional)
          .map((param) => `"${param.name}"`)
          .join(", ")})`,
    );
    const library = C4_LIBRARY_NAMES.filter(
      (name) => !name.endsWith("_") && !C4_MACROS.some((macro) => macro.name === name),
    ).map((name) => `${name}()`);
    expect(c4StatementIssues(wrap([...calls, ...library].join("\n")))).toEqual([]);
  });

  it("accepts the starters", () => {
    for (const starter of Object.values(C4_STARTERS))
      expect(c4StatementIssues(starter.source), starter.title).toEqual([]);
  });

  it("flags an unknown macro and suggests the closest one", () => {
    const source = wrap('Contaner(web, "Web")');
    const [issue] = c4StatementIssues(source);
    expect(issue).toMatchObject({
      message: expect.stringContaining("Unknown macro Contaner"),
      label: "Change to Container",
    });
    expect(apply(source, issue)).toBe(wrap('Container(web, "Web")'));
  });

  it("does not flag a macro the source defines, a library macro, a preprocessor line or another include", () => {
    expect(
      c4StatementIssues(
        wrap(
          [
            "!procedure Service($alias, $label)",
            'Container($alias, $label, "Java")',
            "!endprocedure",
            'Service(api, "API")',
            'AddElementTag("x", $bgColor="red")',
            "!define Local(a) a",
            "!$value = 1",
          ].join("\n"),
        ),
      ),
    ).toEqual([]);
    expect(
      c4StatementIssues(`@startuml\n!include <C4/C4_Container>\n!include helpers.puml\nMystery(a)\n@enduml`),
    ).toEqual([]);
  });

  it("flags a call with no closing parenthesis and adds it", () => {
    const source = wrap('Person(user, "Customer"');
    const [issue] = c4StatementIssues(source);
    expect(issue).toMatchObject({ message: "Person( is missing its closing parenthesis" });
    expect(apply(source, issue)).toBe(wrap('Person(user, "Customer")'));
    const block = wrap('System_Boundary(shop, "Shop" {\n}');
    expect(apply(block, c4StatementIssues(block)[0])).toBe(wrap('System_Boundary(shop, "Shop") {\n}'));
  });

  it("flags missing arguments, trailing text and a dotted alias", () => {
    expect(c4StatementIssues(wrap("Person(user)"))[0]?.message).toContain("Person is missing label");
    expect(c4StatementIssues(wrap("Rel(a, b)"))[0]?.message).toContain("Rel is missing label");
    expect(c4StatementIssues(wrap('Rel(a, b, $label="Uses")'))).toEqual([]);
    expect(c4StatementIssues(wrap('Person(user, "x") nonsense'))[0]?.message).toContain("Unexpected text");
    expect(c4StatementIssues(wrap('Person(a.b, "x")'))[0]?.message).toContain("can't contain a dot");
  });

  it("flags a macro name used without parentheses", () => {
    const source = wrap("SHOW_LEGEND");
    const [issue] = c4StatementIssues(source);
    expect(apply(source, issue)).toBe(wrap("SHOW_LEGEND()"));
  });

  it("does not look inside notes, legends, titles or skinparam blocks", () => {
    expect(
      c4StatementIssues(
        wrap(
          ["legend", "  Bogus(x", "endlegend", "skinparam rectangle {", "  Bogus(x", "}", "title Bogus(x"].join("\n"),
        ),
      ),
    ).toEqual([]);
  });
});

describe("C4 diagnostics pipeline", () => {
  it("shows the issues as diagnostics and as quick fixes", () => {
    const source = wrap('Person(user, "Customer)');
    expect(messages(source)).toContain("Quoted argument has an unmatched quote");
    const fixes = quickFixesForDiagram("c4", source);
    expect(fixes.some((fix) => apply(source, fix) === wrap('Person(user, "Customer")'))).toBe(true);
    expect(analyzeDiagram("c4", wrap('Person(user, "Customer")')).diagnostics).toEqual([]);
  });

  it("reports an unknown macro as an error with its fix", () => {
    const source = wrap('Contaner(web, "Web")');
    expect(diagnosticsForDiagram("c4", source)).toContainEqual(
      expect.objectContaining({ severity: "error", message: expect.stringContaining("Unknown macro Contaner") }),
    );
    expect(quickFixesForDiagram("c4", source).some((fix) => apply(source, fix) === wrap('Container(web, "Web")'))).toBe(
      true,
    );
  });
});
