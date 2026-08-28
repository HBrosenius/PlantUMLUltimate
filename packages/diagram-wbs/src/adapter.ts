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
  parse: (source) => ({ document: parseWbs(source), diagnostics: parseWbs(source).diagnostics }),
  completions,
  diagnostics: (model) => model.diagnostics,
  interactiveObjects: (model): InteractiveObject[] =>
    model.nodes.map((node) => ({ id: node.id, kind: "wbs-node", label: node.label, sourceRange: node.sourceRange })),
  applyVisualOperation: (operation, model, source) => {
    const node = model.nodes.find((item) => item.id === operation.nodeId);
    if (!node) return { edits: [], unavailableReason: "WBS node not found" };
    const next =
      operation.kind === "reorder-node"
        ? reorderWbsNode(
            source,
            model,
            node,
            operation.beforeNodeId ? model.nodes.find((item) => item.id === operation.beforeNodeId) : undefined,
          )
        : moveWbsSubtree(
            source,
            model,
            node,
            operation.parentId ? model.nodes.find((item) => item.id === operation.parentId) : undefined,
            operation.beforeNodeId ? model.nodes.find((item) => item.id === operation.beforeNodeId) : undefined,
          );
    return { edits: [{ range: { from: 0, to: source.length }, text: next }] };
  },
};
