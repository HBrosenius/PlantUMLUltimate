import type {
  CompletionRequest,
  DiagramAdapter,
  InteractiveObject,
  LanguageCompletion,
  VisualOperation,
} from "@plantuml-studio/language-core";
import { detectPlantUmlDiagramType } from "@plantuml-studio/language-plantuml";
import type { WbsDocument, WbsNodeInput } from "./model";
import { parseWbs } from "./parser";
import {
  deleteWbsNode,
  deleteWbsRelationship,
  insertWbsNode,
  insertWbsRelationship,
  moveWbsSubtree,
  reconnectWbsRelationship,
  reorderWbsNode,
  updateWbsNode,
  updateWbsRelationshipColor,
} from "./operations";

export type WbsVisualOperation = VisualOperation &
  (
    | { kind: "insert-node"; value: WbsNodeInput; parentId?: string; afterNodeId?: string }
    | { kind: "update-node"; nodeId: string; value: WbsNodeInput }
    | { kind: "delete-node"; nodeId: string }
    | { kind: "reorder-node"; nodeId: string; beforeNodeId?: string }
    | { kind: "move-subtree"; nodeId: string; parentId?: string; beforeNodeId?: string }
    | { kind: "create-relationship"; fromNodeId: string; toNodeId: string }
    | { kind: "update-relationship-color"; relationshipId: string; color: string }
    | {
        kind: "reconnect-relationship";
        relationshipId: string;
        endpoint: "from" | "to";
        targetNodeId: string;
      }
    | { kind: "delete-relationship"; relationshipId: string }
  );

const replacementEdit = (source: string, next: string) => {
  let from = 0;
  while (from < source.length && from < next.length && source[from] === next[from]) from += 1;
  let sourceTo = source.length;
  let nextTo = next.length;
  while (sourceTo > from && nextTo > from && source[sourceTo - 1] === next[nextTo - 1]) {
    sourceTo -= 1;
    nextTo -= 1;
  }
  return { range: { from, to: sourceTo }, text: next.slice(from, nextTo) };
};

const completions = (request: CompletionRequest, _model: WbsDocument): LanguageCompletion[] => {
  const line = request.source.slice(0, request.position).split(/\r?\n/).at(-1) ?? "";
  if (!/^\s*[*+-]*$/.test(line)) return [];
  return [
    { label: "Root node", insertText: "* Project", detail: "WBS root", kind: "snippet" },
    { label: "Child node", insertText: "** Work package", detail: "WBS child", kind: "snippet" },
    { label: "Left branch", insertText: "-- Work package", detail: "WBS left branch", kind: "snippet" },
    { label: "Right branch", insertText: "++ Work package", detail: "WBS right branch", kind: "snippet" },
  ];
};
export const wbsAdapter: DiagramAdapter<WbsDocument, WbsVisualOperation> = {
  id: "wbs",
  displayName: "WBS",
  capabilities: { visualSelection: true, visualMove: true, visualResize: false, visualDependencies: false },
  detect: (source) => detectPlantUmlDiagramType(source) === "wbs",
  parse: (source) => {
    const document = parseWbs(source);
    return { document, diagnostics: document.diagnostics };
  },
  completions,
  diagnostics: (model) => model.diagnostics,
  interactiveObjects: (model): InteractiveObject[] =>
    model.nodes.map((node) => ({ id: node.id, kind: "wbs-node", label: node.label, sourceRange: node.sourceRange })),
  applyVisualOperation: (operation, model, source) => {
    const operationKind: string = operation.kind;
    let next: string;
    if (operation.kind === "insert-node") {
      const parent = operation.parentId ? model.nodes.find((item) => item.id === operation.parentId) : undefined;
      const after = operation.afterNodeId ? model.nodes.find((item) => item.id === operation.afterNodeId) : undefined;
      if (operation.parentId && !parent) return { edits: [], unavailableReason: "WBS parent node not found" };
      if (operation.afterNodeId && !after) return { edits: [], unavailableReason: "WBS sibling node not found" };
      next = insertWbsNode(source, model, operation.value, parent, after);
      return { edits: [replacementEdit(source, next)] };
    }
    if (operation.kind === "create-relationship") {
      const from = model.nodes.find((item) => item.id === operation.fromNodeId);
      const to = model.nodes.find((item) => item.id === operation.toNodeId);
      if (!from || !to) return { edits: [], unavailableReason: "WBS relationship node not found" };
      next = insertWbsRelationship(source, model, from, to);
      return next === source
        ? { edits: [], unavailableReason: "WBS relationship cannot be created" }
        : { edits: [replacementEdit(source, next)] };
    }
    if (
      operation.kind === "update-relationship-color" ||
      operation.kind === "reconnect-relationship" ||
      operation.kind === "delete-relationship"
    ) {
      const relationship = model.relationships.find((item) => item.id === operation.relationshipId);
      if (!relationship) return { edits: [], unavailableReason: "WBS relationship not found" };
      if (operation.kind === "update-relationship-color") {
        next = updateWbsRelationshipColor(source, relationship, operation.color);
      } else if (operation.kind === "delete-relationship") {
        next = deleteWbsRelationship(source, relationship);
      } else {
        const target = model.nodes.find((item) => item.id === operation.targetNodeId);
        if (!target) return { edits: [], unavailableReason: "WBS target node not found" };
        next = reconnectWbsRelationship(source, model, relationship, operation.endpoint, target);
      }
      return next === source
        ? { edits: [], unavailableReason: "WBS relationship cannot be changed" }
        : { edits: [replacementEdit(source, next)] };
    }
    const node = model.nodes.find((item) => item.id === operation.nodeId);
    if (!node) return { edits: [], unavailableReason: "WBS node not found" };
    if (operation.kind === "update-node") {
      next = updateWbsNode(source, node, operation.value);
      return { edits: [replacementEdit(source, next)] };
    }
    if (operation.kind === "delete-node") {
      next = deleteWbsNode(source, model, node);
      return { edits: [replacementEdit(source, next)] };
    }
    const before = operation.beforeNodeId ? model.nodes.find((item) => item.id === operation.beforeNodeId) : undefined;
    if (operation.beforeNodeId && !before) return { edits: [], unavailableReason: "WBS target node not found" };
    if (operation.kind === "reorder-node") {
      next = reorderWbsNode(source, model, node, before);
    } else if (operation.kind === "move-subtree") {
      const parent = operation.parentId ? model.nodes.find((item) => item.id === operation.parentId) : undefined;
      if (operation.parentId && !parent) return { edits: [], unavailableReason: "WBS parent node not found" };
      next = moveWbsSubtree(source, model, node, parent, before);
    } else {
      return { edits: [], unavailableReason: `Unsupported WBS operation: ${operationKind}` };
    }
    return next === source
      ? { edits: [], unavailableReason: "WBS subtree cannot be moved there" }
      : { edits: [replacementEdit(source, next)] };
  },
};
