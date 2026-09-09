import type {
  CompletionRequest,
  DiagramAdapter,
  InteractiveObject,
  LanguageCompletion,
  VisualOperation,
} from "@plantuml-studio/language-core";
import { detectPlantUmlDiagramType } from "@plantuml-studio/language-plantuml";
import type { WbsDocument } from "./model";
import { parseWbs } from "./parser";
import { moveWbsSubtree, reorderWbsNode } from "./operations";

export type WbsVisualOperation = VisualOperation &
  (
    | { kind: "reorder-node"; nodeId: string; beforeNodeId?: string }
    | { kind: "move-subtree"; nodeId: string; parentId?: string; beforeNodeId?: string }
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
    const node = model.nodes.find((item) => item.id === operation.nodeId);
    if (!node) return { edits: [], unavailableReason: "WBS node not found" };
    const before = operation.beforeNodeId ? model.nodes.find((item) => item.id === operation.beforeNodeId) : undefined;
    if (operation.beforeNodeId && !before) return { edits: [], unavailableReason: "WBS target node not found" };
    let next: string;
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
