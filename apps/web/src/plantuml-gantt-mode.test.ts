import { StringStream } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { plantUmlGanttMode } from "./plantuml-gantt-mode";

function tokens(line: string): Array<[string, string | null]> {
  const stream = new StringStream(line, 4, 2);
  const state = plantUmlGanttMode.startState?.(2) ?? {};
  const result: Array<[string, string | null]> = [];
  while (!stream.eol()) {
    stream.start = stream.pos;
    const style = plantUmlGanttMode.token(stream, state);
    if (stream.pos === stream.start) throw new Error("Tokenizer did not advance");
    if (style) result.push([stream.current(), style]);
  }
  return result;
}

describe("PlantUML Gantt syntax mode", () => {
  it("highlights directives, task labels, keywords, dates, and durations", () => {
    expect(tokens("@startgantt")).toContainEqual(["@startgantt", "meta"]);
    expect(tokens("[Build] starts 2026-09-01")).toEqual([
      ["[Build]", "variableName"],
      ["starts", "keyword"],
      ["2026-09-01", "number"],
    ]);
    expect(tokens("[Build] lasts 5 days")).toEqual([
      ["[Build]", "variableName"],
      ["lasts", "keyword"],
      ["5", "number"],
      ["days", "keyword"],
    ]);
  });

  it("highlights named and hexadecimal task colors", () => {
    expect(tokens("[Task] is colored in Orange")).toContainEqual(["Orange", "string"]);
    expect(tokens("[Task] is coloured in #f97316")).toContainEqual(["#f97316", "string"]);
  });

  it("distinguishes comments from dependency possessives", () => {
    expect(tokens("  ' explanation")).toEqual([["' explanation", "comment"]]);
    expect(tokens("[Test] starts at [Build]'s end")).toContainEqual(["'s", "operator"]);
  });
});
