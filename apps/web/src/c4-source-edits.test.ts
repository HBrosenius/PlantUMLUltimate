import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addC4Boundary,
  addC4Element,
  addC4Relationship,
  C4_MACROS,
  c4Macro,
  changeC4ElementMacro,
  moveC4Element,
  parseC4,
  removeC4Element,
  removeC4Relationship,
  renameC4Alias,
  reorderC4Element,
  setC4RelationshipMacro,
  setC4Settings,
  updateC4Argument,
  type C4EditResult,
} from "./c4-source";
import { C4_STARTERS } from "./c4-starters";
import { loadBundledLibraryFile } from "./render/include-library";

// The gate of slice C1: real C4 sources (the five starters and the spike's captured samples) read and write back
// unchanged, and every edit touches only the lines it must.
const dir = join(process.cwd(), "tests/fixtures/c4-svg");
const fixtures = readdirSync(dir)
  .filter((file) => file.endsWith(".puml"))
  .map((file) => ({ name: file.replace(/\.puml$/, ""), source: readFileSync(join(dir, file), "utf8") }));
const samples = [...C4_STARTERS.map((item) => ({ name: `starter ${item.level}`, source: item.source })), ...fixtures];

const source = (result: C4EditResult) => {
  if (!result.ok) throw new Error(result.message);
  return result.source;
};

describe.each(samples)("C4 source edits on $name", ({ source: text }) => {
  const versions = [
    { label: "LF", text },
    { label: "CRLF", text: text.replaceAll("\n", "\r\n") },
  ];

  it.each(versions)("reads every call site exactly where it is written ($label)", ({ text: input }) => {
    const document = parseC4(input);
    for (const site of [...document.elements, ...document.relationships, ...document.settings.hints]) {
      expect(input.slice(site.nameRange.from, site.nameRange.to).toLowerCase()).toBe(site.macro.toLowerCase());
      expect(input[site.argumentsRange.from - 1]).toBe("(");
      expect(input[site.argumentsRange.to]).toBe(")");
      for (const argument of site.arguments) {
        expect(input.slice(argument.range.from, argument.range.to)).toBe(argument.raw);
        expect(input.slice(argument.valueRange.from, argument.valueRange.to)).toBe(argument.value);
      }
    }
    for (const element of document.elements.filter((item) => item.blockOpen))
      expect(input.slice(element.closeRange!.from, element.closeRange!.to).trim()).toBe("}");
  });

  it.each(versions)("no-op edits leave the source unchanged ($label)", ({ text: input }) => {
    const document = parseC4(input);
    for (const element of document.elements.filter((item) => !item.scope)) {
      for (const argument of element.arguments) {
        const parameter = parameterOf(element, argument);
        if (!parameter || parameter === "alias") continue;
        expect(source(updateC4Argument(input, { kind: "element", alias: element.id }, parameter, argument.value))).toBe(
          input,
        );
      }
      expect(source(changeC4ElementMacro(input, element.id, element.macro))).toBe(input);
      expect(source(renameC4Alias(input, element.id, element.id))).toBe(input);
      expect(source(moveC4Element(input, element.id, element.parent))).toBe(input);
      expect(source(reorderC4Element(input, element.id, element.id, "before"))).toBe(input);
    }
    for (const relationship of document.relationships.filter((item) => !item.scope && item.macro !== "RelIndex")) {
      for (const argument of relationship.arguments) {
        const parameter = parameterOf(relationship, argument);
        if (!parameter || parameter === "from" || parameter === "to") continue;
        expect(
          source(
            updateC4Argument(input, { kind: "relationship", index: relationship.index }, parameter, argument.value),
          ),
        ).toBe(input);
      }
      expect(source(setC4RelationshipMacro(input, relationship.index, relationship.macro))).toBe(input);
    }
    expect(source(setC4Settings(input, {}))).toBe(input);
  });

  it.each(versions)("adding and removing leaves the source unchanged ($label)", ({ text: input }) => {
    const document = parseC4(input);
    const eol = input.includes("\r\n") ? "\r\n" : "\n";
    const withElement = source(addC4Element(input, { macro: "System", alias: "c1_added", label: "Added" }));
    expect(withElement.split(eol).length).toBe(input.split(eol).length + 1);
    expect(source(removeC4Element(withElement, "c1_added"))).toBe(input);

    const withBoundary = source(addC4Boundary(input, { macro: "System_Boundary", alias: "c1_group", label: "Group" }));
    expect(withBoundary.split(eol).length).toBe(input.split(eol).length + 2);
    expect(source(removeC4Element(withBoundary, "c1_group"))).toBe(input);

    const ends = document.elements.filter(
      (item) => item.category !== "boundary" && item.category !== "node" && !item.scope,
    );
    if (ends.length >= 2) {
      const withRelationship = source(addC4Relationship(input, { from: ends[0]!.id, to: ends[1]!.id, label: "added" }));
      expect(withRelationship.split(eol).length).toBe(input.split(eol).length + 1);
      const index = parseC4(withRelationship).relationships.findIndex((item) => item.label === "added");
      expect(source(removeC4Relationship(withRelationship, index))).toBe(input);
    }
  });
});

/** The library parameter an argument fills: its own name, or the one at its position. */
function parameterOf(site: { macro: string; arguments: Array<{ name?: string }> }, argument: { name?: string }) {
  if (argument.name) return argument.name;
  const position = site.arguments.filter((item) => !item.name).indexOf(argument);
  return c4Macro(site.macro)?.params[position]?.name;
}

describe("C4 library parameter names", () => {
  it("declares every optional parameter by the name the operations write as a named argument", async () => {
    const text = (
      await Promise.all(
        ["C4", "C4_Context", "C4_Container", "C4_Component", "C4_Dynamic", "C4_Deployment"].map((name) =>
          loadBundledLibraryFile(`C4/${name}.puml`),
        ),
      )
    ).join("\n");
    for (const macro of C4_MACROS.filter((item) => item.category !== "layout" && item.name !== "RelIndex")) {
      const definition = text.match(new RegExp(`^\\s*!(?:unquoted\\s+)?procedure\\s+${macro.name}\\(([^)]*)\\)`, "im"));
      const declared = definition![1]!.split(",").map((item) =>
        item
          .trim()
          .replace(/^\$/, "")
          .replace(/\s*=.*$/, ""),
      );
      for (const param of macro.params) expect(declared, `${macro.name} ${param.name}`).toContain(param.name);
    }
  });
});
