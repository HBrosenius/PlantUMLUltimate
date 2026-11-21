import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, projectFromPlantUml } from "@plantuml-studio/document-format";
import { diagnosticsForDiagram, quickFixesForDiagram } from "./diagram-diagnostics";
import { detectDiagramKind, normalizeDiagramKind } from "./diagram-kind";
import { diagramTagSuffix, isTreeKind } from "./diagram-tags";
import { importedDiagramKind } from "./import-source";
import { buildDiagramOutlineEntries } from "./diagram-outline";
import { manualErrorGuidance } from "./manual-error-guidance";
import { mindmapCompletions, mindmapQuickFixes } from "./mindmap-language";
import { DEFAULT_MINDMAP_SOURCE, type DiagramKind } from "./model";
import { createSemanticSymbolProvider } from "./semantic-symbol-provider";
import { formatSource } from "./source-format";
import { diagramKindDisplayName, starterSource } from "./use-workspace-documents";
import { validateGeneratedSource } from "./generated-source-validation";
import { validateStarterSource } from "./personal-starters";
import { rendererLayoutEngineForDiagramKind } from "./render/use-renderer";
import { migrateInvalidWbsDirection, normalizeSession, normalizeWorkspace } from "./workspace-storage";
import { parseWorkspaceBackupBundle, serializeWorkspaceBackup } from "./workspace-backup";
import { EditorState } from "@codemirror/state";
import type { CompletionContext } from "@codemirror/autocomplete";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { parseUseCase } from "@plantuml-studio/diagram-usecase";
import { parseClassDiagram } from "@plantuml-studio/diagram-class";
import { parseActivity } from "@plantuml-studio/diagram-activity";
import { parseWbs } from "@plantuml-studio/diagram-wbs";

const MARKDOWN = "@startmindmap\n# Root\n## Child\n### Leaf\n@endmindmap";
const ORG = "@startmindmap\n* Root\n** Child\n*** Leaf\n@endmindmap";

function apply(source: string, fix: { from: number; to: number; replacement: string }) {
  return source.slice(0, fix.from) + fix.replacement + source.slice(fix.to);
}

describe("mindmap kind detection and normalisation", () => {
  it("detects @startmindmap", () => {
    expect(detectDiagramKind(ORG)).toBe("mindmap");
    expect(detectDiagramKind("  @STARTMINDMAP\n* A\n@endmindmap")).toBe("mindmap");
    expect(detectDiagramKind(DEFAULT_MINDMAP_SOURCE)).toBe("mindmap");
  });

  it("keeps a stored mindmap kind and detects one when the stored kind is missing, instead of falling back to Gantt", () => {
    expect(normalizeDiagramKind("mindmap", "@startuml\n@enduml")).toBe("mindmap");
    expect(normalizeDiagramKind(undefined, ORG)).toBe("mindmap");
    expect(normalizeDiagramKind("nonsense", ORG)).toBe("mindmap");
    expect(normalizeDiagramKind(undefined, "@startuml\n@enduml")).toBe("gantt");
  });

  it("imports a mindmap file", () => {
    expect(importedDiagramKind(ORG)).toBe("mindmap");
    expect(() => importedDiagramKind("@startmindmap\n* A\n@endwbs")).toThrow(/matching @endmindmap|@endmindmap/);
  });

  it("maps every kind to its own tag suffix", () => {
    const expected: Record<DiagramKind, string> = {
      gantt: "gantt",
      wbs: "wbs",
      mindmap: "mindmap",
      sequence: "uml",
      usecase: "uml",
      class: "uml",
      component: "uml",
      activity: "uml",
    };
    for (const [kind, suffix] of Object.entries(expected)) expect(diagramTagSuffix(kind as DiagramKind)).toBe(suffix);
    expect(() => diagramTagSuffix("unknown" as DiagramKind)).toThrow(/Unknown diagram kind/);
    expect(isTreeKind("mindmap")).toBe(true);
    expect(isTreeKind("wbs")).toBe(true);
    expect(isTreeKind("gantt")).toBe(false);
  });

  it("renders mindmaps without Graphviz, names and starts them", () => {
    expect(rendererLayoutEngineForDiagramKind("mindmap")).toBe("native");
    expect(diagramKindDisplayName("mindmap")).toBe("Mindmap");
    expect(starterSource("mindmap")).toBe(DEFAULT_MINDMAP_SOURCE);
    expect(starterSource("wbs")).toContain("@startwbs");
    expect(() => starterSource("unknown" as DiagramKind)).toThrow(/Unknown diagram kind/);
  });
});

describe("mindmap diagnostics dispatch", () => {
  it("accepts the starter sources without errors", () => {
    expect(
      diagnosticsForDiagram("mindmap", DEFAULT_MINDMAP_SOURCE).filter((item) => item.severity === "error"),
    ).toEqual([]);
    expect(() => validateStarterSource("mindmap", DEFAULT_MINDMAP_SOURCE)).not.toThrow();
  });

  it("never reports WBS messages or WBS fixes for a mindmap", () => {
    const source = "* Root\n** Child";
    const messages = diagnosticsForDiagram("mindmap", source).map((item) => item.message);
    expect(messages).toContain("Diagram is missing @startmindmap");
    expect(messages.join("\n")).not.toMatch(/WBS|startwbs/);
    const fixes = quickFixesForDiagram("mindmap", source).map((fix) => fix.label ?? fix.message);
    expect(fixes).toContain("Insert @startmindmap");
    expect(fixes).toContain("Insert @endmindmap");
    expect(fixes.join("\n")).not.toMatch(/wbs/i);
    expect(quickFixesForDiagram("wbs", source).map((fix) => fix.label ?? fix.message)).toContain("Insert @startwbs");
  });

  it("adds the missing start and end tags", () => {
    let source = "* Root\n** Child";
    for (const fix of quickFixesForDiagram("mindmap", source).sort((a, b) => b.from - a.from))
      source = apply(source, fix);
    expect(source).toBe("@startmindmap\n* Root\n** Child\n@endmindmap");
    expect(diagnosticsForDiagram("mindmap", source).filter((item) => item.severity === "error")).toEqual([]);
  });

  it("reports a node without a parent, mixed markers and a wrong closing tag", () => {
    const orphan = diagnosticsForDiagram("mindmap", "@startmindmap\n*** Orphan\n@endmindmap");
    expect(orphan.some((item) => /no parent/.test(item.message))).toBe(true);
    const wrongEnd = diagnosticsForDiagram("mindmap", "@startmindmap\n* A\n@endwbs");
    expect(wrongEnd.some((item) => item.severity === "error")).toBe(true);
  });

  it("offers the Markdown to OrgMode conversion for the info diagnostic and applies it", () => {
    const diagnostics = diagnosticsForDiagram("mindmap", MARKDOWN);
    const info = diagnostics.find((item) => item.severity === "info");
    expect(info?.message).toMatch(/Markdown/);
    expect(diagnostics.some((item) => item.severity === "error")).toBe(false);
    const fix = quickFixesForDiagram("mindmap", MARKDOWN).find((item) => /Convert to \* markers/.test(item.message));
    expect(fix).toBeDefined();
    expect(apply(MARKDOWN, fix!)).toBe(ORG);
    // The fix reaches the diagnostic, so the editor shows it on the info message.
    expect(fix!.from <= info!.to && fix!.to >= info!.from).toBe(true);
    expect(diagnosticsForDiagram("mindmap", apply(MARKDOWN, fix!)).filter((item) => item.severity === "info")).toEqual(
      [],
    );
  });

  it("converts the indented list form and keeps colours and boxless markers", () => {
    const source = "@startmindmap\n* Root\n  * Child\n    * Leaf\n@endmindmap";
    const fix = mindmapQuickFixes(source).find((item) => /Convert/.test(item.message));
    expect(fix).toBeDefined();
    expect(apply(source, fix!)).toBe("@startmindmap\n* Root\n** Child\n*** Leaf\n@endmindmap");
  });

  it("offers to remove an arrow line, which the engine does not support", () => {
    const source = "@startmindmap\n* A\n** B\nA -> B\n@endmindmap";
    const fix = mindmapQuickFixes(source).find((item) => /Remove the arrow line/.test(item.message));
    expect(fix).toBeDefined();
    expect(apply(source, fix!)).toBe("@startmindmap\n* A\n** B\n@endmindmap");
  });

  it("gives manual guidance that names the mindmap tags", () => {
    const text = manualErrorGuidance(
      "mindmap",
      { from: 0, to: 1, severity: "error", message: "Closing tag does not match: closing tag before opening" },
      [],
    );
    expect(text).toContain("@startmindmap");
  });
});

describe("mindmap formatter and generated-source validation", () => {
  it("leaves depth markers, sides, directions and Markdown headers exactly as written", () => {
    const source =
      " @startmindmap\n left to right direction\n * Root\n  **[#lightblue]_ Child\n-- Left\n left side\n ** Wrapped\n @endmindmap";
    const result = formatSource("mindmap", source);
    expect(result.reason).toBeUndefined();
    expect(result.source).toBe(
      "@startmindmap\nleft to right direction\n * Root\n  **[#lightblue]_ Child\n-- Left\nleft side\n ** Wrapped\n@endmindmap",
    );
  });

  it("preserves Markdown form lines and refuses to touch sources with errors", () => {
    const formatted = formatSource("mindmap", "@startmindmap\n  # Root\n  ## Child\n@endmindmap");
    expect(formatted.source).toBe("@startmindmap\n  # Root\n  ## Child\n@endmindmap");
    const broken = formatSource("mindmap", "@startmindmap\n*** Orphan\n@endmindmap");
    expect(broken.changes).toEqual([]);
    expect(broken.reason).toMatch(/Resolve source errors/);
  });

  it("does not indent a continuation line of a multi-line node as a declaration", () => {
    const source = "@startmindmap\n*: Line one\nclass Order;\n@endmindmap";
    expect(formatSource("mindmap", source).changes).toEqual([]);
  });

  it("requires the mindmap tags and keeps preserved syntax", () => {
    expect(validateGeneratedSource("mindmap", ORG, "* Root").valid).toBe(false);
    expect(validateGeneratedSource("mindmap", ORG, ORG.replace("Leaf", "Leaf node")).valid).toBe(true);
  });
});

describe("mindmap completions", () => {
  const complete = (text: string, explicit = true) => {
    const state = EditorState.create({ doc: text });
    const context = {
      state,
      pos: text.length,
      explicit,
      matchBefore: (expression: RegExp) => {
        const match = new RegExp(`(?:${expression.source})$`).exec(text);
        return match ? { from: match.index, to: text.length, text: match[0] } : null;
      },
    } as unknown as CompletionContext;
    return mindmapCompletions(context);
  };

  it("offers nodes, sides, directions and styles", () => {
    const labels = complete("")!.options.map((option) => option.label);
    for (const label of [
      "* Topic",
      "** Idea",
      "-- Left branch",
      "++ Right branch",
      "left side",
      "right to left direction",
    ])
      expect(labels).toContain(label);
    expect(labels.join("\n")).not.toMatch(/WBS/);
  });

  it("completes colour names after #", () => {
    const result = complete("** [#ligh");
    expect(result?.options.map((option) => option.label)).toContain("LightBlue");
  });
});

describe("mindmap symbols and outline", () => {
  const empty = {
    gantt: parseGantt("@startgantt\n@endgantt").document,
    sequence: parseSequence("@startuml\n@enduml"),
    useCase: parseUseCase("@startuml\n@enduml"),
    classDiagram: parseClassDiagram("@startuml\n@enduml"),
    activity: parseActivity("@startuml\n@enduml"),
    wbs: parseWbs("@startwbs\n@endwbs"),
  };
  const provider = (source: string) => createSemanticSymbolProvider({ diagramKind: "mindmap", source, ...empty });

  it("lists one declaration per node and renames a label in place", () => {
    const source = "@startmindmap\n* Root\n** Child\n--[#red] Left\n@endmindmap";
    const symbols = provider(source);
    expect(symbols.occurrences.map((item) => item.value)).toEqual(["Root", "Child", "Left"]);
    const child = symbols.occurrences.find((item) => item.value === "Child")!;
    const request = symbols.renameRequest(child)!;
    expect(request.mode).toBe("Mindmap node");
    expect(symbols.renameOccurrenceCount(request)).toBe(1);
    expect(symbols.validateRename(request, "New")).toBeUndefined();
    expect(symbols.validateRename(request, "two\nlines")).toMatch(/line breaks/);
    expect(symbols.rename(request, "Renamed").source).toBe(
      "@startmindmap\n* Root\n** Renamed\n--[#red] Left\n@endmindmap",
    );
    const left = symbols.occurrences.find((item) => item.value === "Left")!;
    expect(symbols.rename(symbols.renameRequest(left)!, "Right").source).toBe(
      "@startmindmap\n* Root\n** Child\n--[#red] Right\n@endmindmap",
    );
  });

  it("does not offer a rename for Markdown-form nodes, which are source-only", () => {
    const symbols = provider(MARKDOWN);
    expect(symbols.occurrences.length).toBeGreaterThan(0);
    expect(symbols.renameRequest(symbols.occurrences[0]!)).toBeUndefined();
  });

  it("builds a nested outline", () => {
    const source = "@startmindmap\n* Root\n** Child\n*** Leaf\n@endmindmap";
    const entries = buildDiagramOutlineEntries(source, provider(source).occurrences, "mindmap");
    expect(entries.map((entry) => [entry.label, entry.typeLabel])).toEqual([
      ["Root", "Mindmap node"],
      ["Child", "Mindmap node"],
      ["Leaf", "Mindmap node"],
    ]);
  });
});

describe("mindmap persistence", () => {
  const WITH_CONTROLS = "@startmindmap\ntop to bottom direction\n* Root\nleft side\n** A\n@endmindmap";

  it("keeps the valid direction and side lines when a stored mindmap is migrated", () => {
    expect(migrateInvalidWbsDirection(WITH_CONTROLS)).not.toContain("left side");
    const session = normalizeSession({
      version: 5,
      activeId: "m",
      documents: [{ id: "m", diagramKind: "mindmap", source: WITH_CONTROLS, fileName: "map.puml" }],
    });
    expect(session.documents[0]!.diagramKind).toBe("mindmap");
    expect(session.documents[0]!.source).toBe(WITH_CONTROLS);
    const legacy = normalizeWorkspace({ diagramKind: "mindmap", source: WITH_CONTROLS });
    expect(legacy.diagramKind).toBe("mindmap");
    const migrated = normalizeSession({ version: 1, source: WITH_CONTROLS, diagramKind: "mindmap" });
    expect(migrated.documents[0]!.diagramKind).toBe("mindmap");
    expect(migrated.documents[0]!.source).toBe(WITH_CONTROLS);
  });

  it("round-trips a workspace backup that holds a mindmap", async () => {
    const session = normalizeSession({
      version: 8,
      activeId: "m",
      documents: [{ id: "m", diagramKind: "mindmap", source: ORG, fileName: "map.puml" }],
    });
    const text = await serializeWorkspaceBackup(session, [], undefined);
    const restored = await parseWorkspaceBackupBundle(text);
    expect(restored.session.documents[0]!.diagramKind).toBe("mindmap");
    expect(restored.session.documents[0]!.source).toBe(ORG);
  });

  it("round-trips a multi-diagram document with a mindmap and refuses a WBS link on it", async () => {
    const project = await projectFromPlantUml(ORG, "mindmap", "Ideas");
    const gantt = await projectFromPlantUml("@startgantt\n[Work] lasts 2 days\n@endgantt", "gantt", "Plan");
    project.diagrams.push(gantt.diagrams[0]!);
    const decoded = await decodeProject((await encodeProject(project)).bytes);
    expect(decoded.project.diagrams.map((item) => item.document.current.diagramKind)).toEqual(["mindmap", "gantt"]);
    expect(decoded.project.diagrams[0]!.document.current.source).toBe(ORG);

    const linked = structuredClone(project);
    linked.diagrams[1]!.wbsGantt = { wbsDiagramId: linked.diagrams[0]!.id, links: [], dependencies: [] };
    await expect(encodeProject(linked)).rejects.toThrow(/WBS diagram/);
    const onMindmap = structuredClone(project);
    onMindmap.diagrams[0]!.wbsGantt = { wbsDiagramId: onMindmap.diagrams[0]!.id, links: [], dependencies: [] };
    await expect(encodeProject(onMindmap)).rejects.toThrow(/wbsGantt/);
  });
});

describe("mindmap parser stays distinct from WBS", () => {
  it("parses sides and directions that the WBS migration would remove", () => {
    const document = parseMindmap("@startmindmap\nright to left direction\n* Root\nleft side\n** A\n@endmindmap");
    expect(document.direction?.value).toBe("right-to-left");
    expect(document.sideSwitches).toHaveLength(1);
  });
});
