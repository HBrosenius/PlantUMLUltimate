import { useCallback } from "react";
import { applySourceEdits } from "@plantuml-studio/diagram-gantt";
import {
  parseMindmap,
  setMindmapCaption,
  setMindmapDirection,
  setMindmapFooter,
  setMindmapHeader,
  setMindmapLegend,
  setMindmapTitle,
  type MindmapDirection,
  type MindmapDocument,
  type MindmapNode,
  type MindmapNodeInput,
} from "@plantuml-studio/diagram-mindmap";
import { applicationMindmapAdapter } from "../../diagram-adapters";
import type { MindmapInsertPosition } from "./MindmapDialogs";

/** What the Settings inspector edits. An empty text removes the statement. */
export interface MindmapSettings {
  /** Undefined removes the direction line (the engine then draws left to right). */
  direction: MindmapDirection | undefined;
  title: string;
  caption: string;
  header: string;
  footer: string;
  legend: string;
}

export const MINDMAP_ONLY_ROOT_MESSAGE =
  "The only root cannot be deleted: a mindmap needs a root node. Rename it, or replace the source instead.";

/** Why a node cannot be deleted, or undefined. Removing the only root leaves source the engine rejects. */
export function mindmapDeleteBlocker(document: MindmapDocument, node: MindmapNode): string | undefined {
  return node.depth === 1 && document.roots.length <= 1 ? MINDMAP_ONLY_ROOT_MESSAGE : undefined;
}

/** The settings as the document currently has them, for the inspector's form. */
export function mindmapSettingsOf(document: MindmapDocument): MindmapSettings {
  return {
    direction: document.direction?.value,
    title: document.title?.text ?? "",
    caption: document.caption?.text ?? "",
    header: document.header?.text ?? "",
    footer: document.footer?.text ?? "",
    legend: document.legend?.text ?? "",
  };
}

/** Applies every changed setting in turn, parsing between steps so each edit sees the previous result. */
export function applyMindmapSettings(source: string, settings: MindmapSettings): string {
  let current = source;
  const text = (value: string) => value.replace(/\r\n?/g, "\n").trim();
  // A new line goes right after the start tag, so new lines are added last-first to read direction, title, ... legend.
  const steps: Array<[keyof MindmapSettings, (document: MindmapDocument) => string]> = [
    ["legend", (document) => setMindmapLegend(current, document, settings.legend)],
    ["footer", (document) => setMindmapFooter(current, document, settings.footer)],
    ["header", (document) => setMindmapHeader(current, document, settings.header)],
    ["caption", (document) => setMindmapCaption(current, document, settings.caption)],
    ["title", (document) => setMindmapTitle(current, document, settings.title)],
    ["direction", (document) => setMindmapDirection(current, document, settings.direction)],
  ];
  for (const [key, apply] of steps) {
    const document = parseMindmap(current);
    const existing = mindmapSettingsOf(document)[key];
    const wanted = settings[key];
    const unchanged =
      typeof existing === "string" && typeof wanted === "string"
        ? text(existing) === text(wanted)
        : existing === wanted;
    if (unchanged) continue;
    current = apply(document);
  }
  return current;
}

/** A node with everything below it: what stays the same when a subtree is moved. */
const subtreeSignature = (document: MindmapDocument, node: MindmapNode) =>
  document.nodes
    .filter((item) => item.sourceRange.from >= node.sourceRange.from && item.sourceRange.from <= node.subtreeRange.to)
    .map((item) => item.label)
    .join("\u0000");

/**
 * The id the same node has after an edit that only reordered nodes. Ids are positions, so a move shifts
 * the ids of everything between the old and the new place; the node is found again by its label and the
 * labels below it, taking the same turn among identical subtrees.
 */
export function remapMindmapNodeId(
  before: MindmapDocument,
  after: MindmapDocument,
  nodeId: string,
): string | undefined {
  const node = before.nodes.find((item) => item.id === nodeId);
  if (!node) return undefined;
  const wanted = subtreeSignature(before, node);
  const turn = before.nodes
    .filter((item) => subtreeSignature(before, item) === wanted)
    .findIndex((item) => item.id === nodeId);
  const candidates = after.nodes.filter((item) => subtreeSignature(after, item) === wanted);
  return candidates[Math.min(turn, candidates.length - 1)]?.id;
}

/** The node that a successful insertion added: the first place where the labels of old and new differ. */
export function findInsertedMindmapNode(
  before: MindmapDocument,
  after: MindmapDocument,
  label: string,
): MindmapNode | undefined {
  if (after.nodes.length !== before.nodes.length + 1) return undefined;
  const index = after.nodes.findIndex((node, position) => node.label !== before.nodes[position]?.label);
  const found = after.nodes[index === -1 ? after.nodes.length - 1 : index];
  return found?.label === label ? found : after.nodes.find((node) => node.label === label);
}

interface UseMindmapActionsOptions {
  source: string;
  document: MindmapDocument;
  selectedNode: MindmapNode | undefined;
  /** The node a new node is added to: the selected node, or the only root when nothing is selected. */
  addTarget: MindmapNode | undefined;
  commitSource(source: string, description: string): boolean;
  confirmDelete(message: string): boolean;
  closeAddNode(): void;
  selectNode(id: string | undefined): void;
  clearSelectedNode(): void;
  reportMessage(message: string): void;
}

export function useMindmapActions({
  source,
  document,
  selectedNode,
  addTarget,
  commitSource,
  confirmDelete,
  closeAddNode,
  selectNode,
  clearSelectedNode,
  reportMessage,
}: UseMindmapActionsOptions) {
  const applyOperation = useCallback(
    (operation: ReturnType<typeof applicationMindmapAdapter.applyVisualOperation>, fallback?: string) => {
      if (operation.unavailableReason) {
        reportMessage(operation.unavailableReason);
        return undefined;
      }
      const edited = applySourceEdits(source, operation.edits);
      if (edited === source) {
        if (fallback) reportMessage(fallback);
        return undefined;
      }
      return edited;
    },
    [reportMessage, source],
  );

  // A move shifts the ids of the nodes it passes over, so the selection follows its node to the new id.
  const keepSelection = useCallback(
    (updated: string) => {
      if (selectedNode) selectNode(remapMindmapNodeId(document, parseMindmap(updated), selectedNode.id));
    },
    [document, selectNode, selectedNode],
  );

  const addNode = useCallback(
    (value: MindmapNodeInput, position: MindmapInsertPosition) => {
      const selected = document.nodes.find((item) => item.id === addTarget?.id);
      const parent = position === "child" ? selected : undefined;
      const after = position === "sibling" ? selected : undefined;
      const updated = applyOperation(
        applicationMindmapAdapter.applyVisualOperation(
          {
            kind: "insert-node",
            value,
            ...(parent ? { parentId: parent.id } : {}),
            ...(after ? { afterNodeId: after.id } : {}),
          },
          document,
          source,
        ),
        "The node cannot be added there",
      );
      if (updated === undefined) return;
      if (!commitSource(updated, `Add mindmap node ${value.label}`)) return;
      closeAddNode();
      reportMessage(`Added mindmap node ${value.label}`);
      selectNode(findInsertedMindmapNode(document, parseMindmap(updated), value.label)?.id);
    },
    [applyOperation, closeAddNode, commitSource, document, reportMessage, selectNode, addTarget?.id, source],
  );

  const applyNode = useCallback(
    (value: MindmapNodeInput) => {
      if (!selectedNode) return;
      const updated = applyOperation(
        applicationMindmapAdapter.applyVisualOperation(
          { kind: "update-node", nodeId: selectedNode.id, value },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      if (!commitSource(updated, `Update mindmap node ${selectedNode.label}`)) return;
      reportMessage(`Updated mindmap node ${value.label}`);
      return updated;
    },
    [applyOperation, commitSource, document, reportMessage, selectedNode, source],
  );

  const toggleBoxless = useCallback(
    (boxless: boolean) => {
      if (!selectedNode) return;
      const updated = applyOperation(
        applicationMindmapAdapter.applyVisualOperation(
          { kind: "toggle-boxless", nodeId: selectedNode.id, boxless },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      if (!commitSource(updated, `${boxless ? "Remove the box from" : "Box"} mindmap node ${selectedNode.label}`))
        return;
      reportMessage(boxless ? `${selectedNode.label} is now drawn without a box` : `${selectedNode.label} has a box`);
    },
    [applyOperation, commitSource, document, reportMessage, selectedNode, source],
  );

  const setNodeSide = useCallback(
    (side: "left" | "right", node: MindmapNode | undefined = selectedNode) => {
      if (!node) return;
      const updated = applyOperation(
        applicationMindmapAdapter.applyVisualOperation({ kind: "set-side", nodeId: node.id, side }, document, source),
      );
      if (updated === undefined) return;
      if (!commitSource(updated, `Move mindmap branch ${node.label} to the ${side}`)) return;
      reportMessage(`Moved ${node.label} to the ${side}`);
      keepSelection(updated);
    },
    [applyOperation, commitSource, document, keepSelection, reportMessage, selectedNode, source],
  );

  const removeNode = useCallback(
    (node: MindmapNode | undefined = selectedNode) => {
      if (!node) return;
      const blocker = mindmapDeleteBlocker(document, node);
      if (blocker) {
        reportMessage(blocker);
        return;
      }
      const descendants = document.nodes.filter(
        (item) => item.sourceRange.from > node.sourceRange.from && item.sourceRange.to <= node.subtreeRange.to,
      ).length;
      if (
        !confirmDelete(
          `Delete “${node.label}”${descendants ? ` and its ${descendants} descendant${descendants === 1 ? "" : "s"}` : ""}?`,
        )
      )
        return;
      const updated = applyOperation(
        applicationMindmapAdapter.applyVisualOperation({ kind: "delete-node", nodeId: node.id }, document, source),
      );
      if (updated === undefined) return;
      if (!commitSource(updated, `Delete mindmap subtree ${node.label}`)) return;
      clearSelectedNode();
      reportMessage(`Deleted mindmap subtree ${node.label}`);
    },
    [applyOperation, clearSelectedNode, commitSource, confirmDelete, document, reportMessage, selectedNode, source],
  );

  const moveNode = useCallback(
    (nodeId: string, parentId?: string, beforeId?: string, side?: "left" | "right") => {
      const node = document.nodes.find((item) => item.id === nodeId);
      const parent = parentId ? document.nodes.find((item) => item.id === parentId) : undefined;
      if (!node) return;
      const updated = applyOperation(
        applicationMindmapAdapter.applyVisualOperation(
          {
            kind: "move-subtree",
            nodeId,
            ...(parentId ? { parentId } : {}),
            ...(beforeId ? { beforeNodeId: beforeId } : {}),
            ...(side ? { side } : {}),
          },
          document,
          source,
        ),
        "That mindmap branch cannot be moved there",
      );
      if (updated === undefined) return;
      if (!commitSource(updated, `Move mindmap branch ${node.label}`)) return;
      keepSelection(updated);
      reportMessage(`Moved ${node.label}${parent ? ` under ${parent.label}` : ""}${side ? ` to the ${side}` : ""}`);
    },
    [applyOperation, commitSource, document, keepSelection, reportMessage, source],
  );

  const applySettings = useCallback(
    (settings: MindmapSettings) => {
      const updated = applyMindmapSettings(source, settings);
      if (updated === source) {
        reportMessage("The mindmap settings are unchanged");
        return;
      }
      if (!commitSource(updated, "Update mindmap settings")) return;
      reportMessage("Updated mindmap settings");
    },
    [commitSource, reportMessage, source],
  );

  const convertToOrgMode = useCallback(() => {
    const updated = applyOperation(
      applicationMindmapAdapter.applyVisualOperation({ kind: "convert-to-orgmode" }, document, source),
    );
    if (updated === undefined) return;
    if (!commitSource(updated, "Convert mindmap to * markers")) return;
    reportMessage("Converted the mindmap to * markers");
  }, [applyOperation, commitSource, document, reportMessage, source]);

  return { addNode, applyNode, toggleBoxless, setNodeSide, removeNode, moveNode, applySettings, convertToOrgMode };
}
