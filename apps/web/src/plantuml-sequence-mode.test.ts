import { StringStream } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { plantUmlSequenceMode } from "./plantuml-sequence-mode";

function tokens(line: string): Array<[string, string | null]> {
  const stream = new StringStream(line, 4, 2);
  const state = plantUmlSequenceMode.startState?.(2) ?? {};
  const result: Array<[string, string | null]> = [];
  while (!stream.eol()) {
    stream.start = stream.pos;
    const style = plantUmlSequenceMode.token(stream, state);
    if (stream.pos === stream.start) throw new Error("Tokenizer did not advance");
    if (style) result.push([stream.current(), style]);
  }
  return result;
}

describe("PlantUML Sequence syntax mode", () => {
  it("distinguishes participants, arrows, lifecycle modifiers, and message text", () => {
    expect(tokens('participant "Web app" as Web <<Boundary>> #LightBlue')).toEqual(
      expect.arrayContaining([
        ["participant", "keyword"],
        ['"Web app"', "string"],
        ["Web", "variableName"],
        ["<<Boundary>>", "typeName"],
        ["#LightBlue", "string"],
      ]),
    );
    expect(tokens("User -->> Web ++: Create order")).toEqual(
      expect.arrayContaining([
        ["User", "variableName"],
        ["-->>", "operator"],
        ["Web", "variableName"],
        ["++", "modifier"],
        ["Create", "string"],
        ["order", "string"],
      ]),
    );
  });

  it("highlights directives, fragments, anchors, numbers, and comments", () => {
    expect(tokens("@startuml")).toContainEqual(["@startuml", "meta"]);
    expect(tokens("alt#Gold Accepted")).toEqual(
      expect.arrayContaining([
        ["alt", "keyword"],
        ["#Gold", "string"],
        ["Accepted", "variableName"],
      ]),
    );
    expect(tokens("{start} User -> API: call 42")).toEqual(
      expect.arrayContaining([
        ["{start}", "labelName"],
        ["42", "string"],
      ]),
    );
    expect(tokens("' explanation")).toEqual([["' explanation", "comment"]]);
  });
});
