import { replacementEdit } from "@plantuml-studio/diagram-tree";
import type {
  CompletionRequest,
  DiagramAdapter,
  InteractiveObject,
  LanguageCompletion,
  VisualOperation,
} from "@plantuml-studio/language-core";
import { detectPlantUmlDiagramType } from "@plantuml-studio/language-plantuml";
import type { MindmapDirection, MindmapDocument, MindmapNodeInput } from "./model";
import {
  convertMindmapToOrgMode,
  deleteMindmapNode,
  insertMindmapNode,
  mindmapEditBlocker,
  mindmapSideBlocker,
  moveMindmapSubtree,
  reorderMindmapNode,
  setMindmapCaption,
  setMindmapDirection,
  setMindmapFooter,
  setMindmapHeader,
  setMindmapLegend,
  setMindmapNodeBoxless,
  setMindmapNodeSide,
  setMindmapTitle,
  updateMindmapNode,
} from "./operations";
import { parseMindmap } from "./parser";

export type MindmapVisualOperation = VisualOperation &
  (
    | { kind: "insert-node"; value: MindmapNodeInput; parentId?: string; afterNodeId?: string }
    | { kind: "update-node"; nodeId: string; value: MindmapNodeInput }
    | { kind: "toggle-boxless"; nodeId: string; boxless?: boolean }
    | { kind: "delete-node"; nodeId: string }
    | { kind: "reorder-node"; nodeId: string; beforeNodeId?: string }
    | {
        kind: "move-subtree";
        nodeId: string;
        parentId?: string;
        beforeNodeId?: string;
        side?: "left" | "right";
      }
    | { kind: "set-side"; nodeId: string; side: "left" | "right" }
    | { kind: "set-direction"; direction?: MindmapDirection }
    | { kind: "set-title"; text?: string }
    | { kind: "set-caption"; text?: string }
    | { kind: "set-header"; text?: string; placement?: string }
    | { kind: "set-footer"; text?: string; placement?: string }
    | { kind: "set-legend"; text?: string; placement?: string }
    | { kind: "convert-to-orgmode" }
  );

const completions = (request: CompletionRequest, _model: MindmapDocument): LanguageCompletion[] => {
  const line = request.source.slice(0, request.position).split(/\r?\n/).at(-1) ?? "";
  if (!/^\s*[*+-]*$/.test(line)) return [];
  return [
    { label: "Root node", insertText: "* Topic", detail: "Mindmap root", kind: "snippet" },
    { label: "Child node", insertText: "** Idea", detail: "Mindmap child", kind: "snippet" },
    { label: "Left branch", insertText: "-- Idea", detail: "Mindmap left branch", kind: "snippet" },
    { label: "Right branch", insertText: "++ Idea", detail: "Mindmap right branch", kind: "snippet" },
    { label: "Left side", insertText: "left side", detail: "Following * children go left", kind: "keyword" },
  ];
};

export const mindmapAdapter: DiagramAdapter<MindmapDocument, MindmapVisualOperation> = {
  id: "mindmap",
  displayName: "Mindmap",
  capabilities: { visualSelection: true, visualMove: true, visualResize: false, visualDependencies: false },
  detect: (source) => detectPlantUmlDiagramType(source) === "mindmap",
  parse: (source) => {
    const document = parseMindmap(source);
    return { document, diagnostics: document.diagnostics };
  },
  completions,
  diagnostics: (model) => model.diagnostics,
  interactiveObjects: (model): InteractiveObject[] =>
    model.nodes.map((node) => ({
      id: node.id,
      kind: "mindmap-node",
      label: node.label,
      sourceRange: node.sourceRange,
    })),
  applyVisualOperation: (operation, model, source) => {
    const operationKind: string = operation.kind;
    const done = (next: string, unavailableReason: string) =>
      next === source ? { edits: [], unavailableReason } : { edits: [replacementEdit(source, next)] };
    switch (operation.kind) {
      case "set-direction":
        return done(setMindmapDirection(source, model, operation.direction), "The direction is already set");
      case "set-title":
        return done(setMindmapTitle(source, model, operation.text), "The title is already set");
      case "set-caption":
        return done(setMindmapCaption(source, model, operation.text), "The caption is already set");
      case "set-header":
        return done(setMindmapHeader(source, model, operation.text, operation.placement), "The header is already set");
      case "set-footer":
        return done(setMindmapFooter(source, model, operation.text, operation.placement), "The footer is already set");
      case "set-legend":
        return done(setMindmapLegend(source, model, operation.text, operation.placement), "The legend is already set");
      case "convert-to-orgmode":
        return done(convertMindmapToOrgMode(source, model), "The mindmap already uses * markers");
      case "insert-node": {
        const parent = operation.parentId ? model.nodes.find((item) => item.id === operation.parentId) : undefined;
        const after = operation.afterNodeId ? model.nodes.find((item) => item.id === operation.afterNodeId) : undefined;
        if (operation.parentId && !parent) return { edits: [], unavailableReason: "Mindmap parent node not found" };
        if (operation.afterNodeId && !after) return { edits: [], unavailableReason: "Mindmap sibling node not found" };
        const blocker = mindmapEditBlocker(model, parent, after);
        if (blocker) return { edits: [], unavailableReason: blocker };
        return done(insertMindmapNode(source, model, operation.value, parent, after), "The node cannot be added there");
      }
      default:
        break;
    }
    const node = "nodeId" in operation ? model.nodes.find((item) => item.id === operation.nodeId) : undefined;
    if (!node) return { edits: [], unavailableReason: "Mindmap node not found" };
    switch (operation.kind) {
      case "delete-node":
        return done(deleteMindmapNode(source, node), "The node cannot be deleted");
      case "update-node": {
        const blocker = mindmapEditBlocker(model, node.markdown ? node : undefined);
        if (blocker) return { edits: [], unavailableReason: blocker };
        return done(updateMindmapNode(source, node, operation.value), "The node is unchanged");
      }
      case "toggle-boxless": {
        const blocker = mindmapEditBlocker(model, node.markdown ? node : undefined);
        if (blocker) return { edits: [], unavailableReason: blocker };
        return done(setMindmapNodeBoxless(source, node, operation.boxless ?? !node.boxless), "The node is unchanged");
      }
      case "set-side": {
        const blocker = mindmapSideBlocker(source, model, node);
        if (blocker) return { edits: [], unavailableReason: blocker };
        return done(setMindmapNodeSide(source, model, node, operation.side), "The node is already on that side");
      }
      case "reorder-node":
      case "move-subtree": {
        const before = operation.beforeNodeId
          ? model.nodes.find((item) => item.id === operation.beforeNodeId)
          : undefined;
        if (operation.beforeNodeId && !before) return { edits: [], unavailableReason: "Mindmap target node not found" };
        if (operation.kind === "reorder-node") {
          const blocker = mindmapEditBlocker(model, node, before);
          if (blocker) return { edits: [], unavailableReason: blocker };
          return done(reorderMindmapNode(source, model, node, before), "The subtree cannot be moved there");
        }
        const parent = operation.parentId ? model.nodes.find((item) => item.id === operation.parentId) : undefined;
        if (operation.parentId && !parent) return { edits: [], unavailableReason: "Mindmap parent node not found" };
        const blocker = mindmapEditBlocker(model, node, parent, before);
        if (blocker) return { edits: [], unavailableReason: blocker };
        return done(
          moveMindmapSubtree(source, model, node, parent, before, operation.side),
          "The subtree cannot be moved there",
        );
      }
      default:
        return { edits: [], unavailableReason: `Unsupported mindmap operation: ${operationKind}` };
    }
  },
};
