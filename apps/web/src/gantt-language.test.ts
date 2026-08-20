import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { describe, expect, it } from "vitest";
import { ganttCompletions, ganttDiagnostics, ganttQuickFixes } from "./gantt-language";

describe("Gantt CodeMirror language service", () => {
  it("completes existing task names at the start of a new task statement", () => {
    const source = "@startgantt\n[Design] lasts 4 days\n[Build task] lasts 2 days\n[Bu\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("[Bu\n") + 3;
    const result = ganttCompletions(new CompletionContext(state, position, false));
    expect(result?.from).toBe(position - 2);
    expect(result?.options.find((option) => option.label === "Build task")?.apply).toBe("Build task] ");
  });

  it("completes tasks and statements after the simplified then keyword", () => {
    const source = "@startgantt\n[Design] lasts 4 days\nthen [De\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("[De\n") + 3;
    expect(
      ganttCompletions(new CompletionContext(state, position, false))?.options.map((option) => option.label),
    ).toContain("Design");

    const statementSource = "@startgantt\n[Design] lasts 4 days\nthen [Build] s\n@endgantt";
    const statementState = EditorState.create({ doc: statementSource });
    const statementPosition = statementSource.indexOf("s\n@endgantt") + 1;
    expect(
      ganttCompletions(new CompletionContext(statementState, statementPosition, false))?.options.map(
        (option) => option.label,
      ),
    ).toContain("starts at");
  });

  it("completes existing people inside resource braces", () => {
    const source = "@startgantt\n[A] on {Alice:50%} lasts 2 days\n[B] on {Al\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("{Al\n") + 3;
    const option = ganttCompletions(new CompletionContext(state, position, false))?.options.find(
      (item) => item.label === "Alice",
    );
    expect(option?.apply).toBe("Alice:100%}");
  });

  it("offers a quick fix for a color statement missing 'in'", () => {
    const diagnostics = ganttDiagnostics("@startgantt\n[A] is colored Orange\n@endgantt");
    expect(diagnostics[0]?.actions?.[0]?.name).toBe("Fix statement");
  });

  it("exposes duplicate task prefixes as persistent quick fixes", () => {
    const source = "@startgantt\n[Build] [Build] starts 2026-09-01\n@endgantt";
    expect(ganttQuickFixes(source)).toEqual([
      expect.objectContaining({
        replacement: "[Build] starts 2026-09-01",
        message: expect.stringContaining("repeated"),
      }),
    ]);
  });

  it("shows a task name but inserts its alias for further declarations", () => {
    const source = "@startgantt\n[Long task name] as [T1] lasts 2 days\n[Lo\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("[Lo\n") + 3;
    const completion = ganttCompletions(new CompletionContext(state, position, false))?.options.find(
      (option) => option.label === "Long task name",
    );
    expect(completion?.apply).toBe("T1] ");
    expect(completion?.detail).toContain("alias T1");
  });

  it("completes known task references", () => {
    const source = "@startgantt\n[Design] lasts 4 days\n[Build] starts at [\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("[\n@endgantt");
    const result = ganttCompletions(new CompletionContext(state, position + 1, true));
    expect(result?.options.map((option) => option.label)).toContain("Design");
    expect(result?.options.find((option) => option.label === "Design")?.apply).toBe("Design]'s end");
  });

  it("offers syntax-aware task statement keywords", () => {
    const source = "@startgantt\n[Build] s\n@endgantt";
    const state = EditorState.create({ doc: source });
    const result = ganttCompletions(new CompletionContext(state, source.indexOf("s\n") + 1, false));
    expect(result?.options.map((option) => option.label)).toContain("starts at");
    expect(result?.options.map((option) => option.label)).toContain("is colored in");
    expect(result?.options.map((option) => option.label)).toContain("requires");
    expect(result?.options.map((option) => option.label)).toContain("pauses on");
  });

  it("offers valid inline continuations after a fixed task start date", () => {
    const source = "@startgantt\n[New task] starts 2026-09-01 \n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf(" \n@endgantt") + 1;
    const result = ganttCompletions(new CompletionContext(state, position, false));
    expect(result?.options).toMatchObject([
      { label: "and ends", apply: "and ends 2026-09-01" },
      { label: "and lasts", apply: "and lasts 1 day" },
      { label: "and is colored in", apply: "and is colored in Orange" },
      { label: "and is completed", apply: "and is 0% completed" },
    ]);
  });

  it("filters inline continuations while typing and", () => {
    const source = "@startgantt\n[New task] starts 2026-09-01 and\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("and\n") + 3;
    const result = ganttCompletions(new CompletionContext(state, position, false));
    expect(result?.from).toBe(position - 3);
    expect(result?.options.map((option) => option.label)).toContain("and ends");
    expect(result?.validFor).toEqual(/^[\w ]*$/);
  });

  it("does not diagnose supported task color statements", () => {
    expect(
      ganttDiagnostics("@startgantt\n[Unified Messaging Search Front End Testing] is colored in Orange\n@endgantt"),
    ).toEqual([]);
  });

  it("does not diagnose an absolute-date milestone", () => {
    expect(
      ganttDiagnostics("@startgantt\n[DF Rating Production Data Available] happens 2026-09-03\n@endgantt"),
    ).toEqual([]);
  });

  it("completes color values after the color statement", () => {
    const source = "@startgantt\n[Unified Messaging Analytics Back End Testing] is colored in Ora\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("Ora\n") + 3;
    const result = ganttCompletions(new CompletionContext(state, position, false));
    expect(result?.from).toBe(position - 3);
    expect(result?.options.map((option) => option.label)).toContain("Orange");
    expect(result?.options.map((option) => option.label)).toContain("OrangeRed");
    expect(result?.validFor).toEqual(/^[a-z]*$/i);
  });

  it("supports color-value completion with British spelling", () => {
    const source = "@startgantt\n[Task] is coloured in LightB\n@endgantt";
    const state = EditorState.create({ doc: source });
    const position = source.indexOf("LightB\n") + 6;
    expect(
      ganttCompletions(new CompletionContext(state, position, false))?.options.map((option) => option.label),
    ).toContain("LightBlue");
  });

  it("maps parser diagnostics to CodeMirror diagnostics", () => {
    const diagnostics = ganttDiagnostics("@startgantt\n[Build] starts at [Missing]'s end\n@endgantt");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("Missing");
    expect(diagnostics[0]?.source).toBe("PlantUML Gantt");
  });
});
