import { useCallback } from "react";
import { applySourceEdits } from "@plantuml-studio/diagram-gantt";
import type { WbsDocument, WbsNode, WbsNodeInput, WbsRelationship } from "@plantuml-studio/diagram-wbs";
import { applicationWbsAdapter } from "../../diagram-adapters";
import type { WbsInsertPosition } from "./WbsDialogs";

interface UseWbsActionsOptions {
  source: string;
  document: WbsDocument;
  selectedNode: WbsNode | undefined;
  selectedRelationship: WbsRelationship | undefined;
  commitSource(source: string, description: string): boolean;
  confirmDelete(message: string): boolean;
  closeAddNode(): void;
  clearSelectedNode(): void;
  clearSelectedRelationship(): void;
  reportMessage(message: string): void;
}

export function useWbsActions({
  source,
  document,
  selectedNode,
  selectedRelationship,
  commitSource,
  confirmDelete,
  closeAddNode,
  clearSelectedNode,
  clearSelectedRelationship,
  reportMessage,
}: UseWbsActionsOptions) {
  const applyOperation = useCallback(
    (operation: ReturnType<typeof applicationWbsAdapter.applyVisualOperation>) => {
      if (operation.unavailableReason) {
        reportMessage(operation.unavailableReason);
        return undefined;
      }
      return applySourceEdits(source, operation.edits);
    },
    [reportMessage, source],
  );

  const addWbsNode = useCallback(
    (value: WbsNodeInput, position: WbsInsertPosition) => {
      const selected = document.nodes.find((item) => item.id === selectedNode?.id);
      const parent = position === "child" ? selected : undefined;
      const after = position === "sibling" ? selected : undefined;
      const updated = applyOperation(
        applicationWbsAdapter.applyVisualOperation(
          {
            kind: "insert-node",
            value,
            ...(parent ? { parentId: parent.id } : {}),
            ...(after ? { afterNodeId: after.id } : {}),
          },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      commitSource(updated, `Add WBS node ${value.label}`);
      closeAddNode();
      reportMessage(`Added WBS node ${value.label}`);
    },
    [applyOperation, closeAddNode, commitSource, document, reportMessage, selectedNode?.id, source],
  );

  const applyWbsNode = useCallback(
    (value: WbsNodeInput) => {
      if (!selectedNode) return;
      const updated = applyOperation(
        applicationWbsAdapter.applyVisualOperation(
          { kind: "update-node", nodeId: selectedNode.id, value },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      commitSource(updated, `Update WBS node ${selectedNode.label}`);
      reportMessage(`Updated WBS node ${value.label}`);
    },
    [applyOperation, commitSource, document, reportMessage, selectedNode, source],
  );

  const removeWbsNode = useCallback(() => {
    if (!selectedNode) return;
    const descendants = document.nodes.filter(
      (item) =>
        item.sourceRange.from > selectedNode.sourceRange.from && item.sourceRange.to <= selectedNode.subtreeRange.to,
    ).length;
    if (
      !confirmDelete(
        `Delete “${selectedNode.label}”${descendants ? ` and its ${descendants} descendant${descendants === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    const updated = applyOperation(
      applicationWbsAdapter.applyVisualOperation({ kind: "delete-node", nodeId: selectedNode.id }, document, source),
    );
    if (updated === undefined) return;
    commitSource(updated, `Delete WBS subtree ${selectedNode.label}`);
    clearSelectedNode();
    clearSelectedRelationship();
    reportMessage(`Deleted WBS subtree ${selectedNode.label}`);
  }, [
    applyOperation,
    clearSelectedNode,
    clearSelectedRelationship,
    commitSource,
    confirmDelete,
    document,
    reportMessage,
    selectedNode,
    source,
  ]);

  const moveWbsNode = useCallback(
    (nodeId: string, parentId?: string, beforeId?: string) => {
      const node = document.nodes.find((item) => item.id === nodeId);
      const parent = parentId ? document.nodes.find((item) => item.id === parentId) : undefined;
      const before = beforeId ? document.nodes.find((item) => item.id === beforeId) : undefined;
      if (!node) return;
      const operation = applicationWbsAdapter.applyVisualOperation(
        {
          kind: "move-subtree",
          nodeId,
          ...(parentId ? { parentId } : {}),
          ...(beforeId ? { beforeNodeId: beforeId } : {}),
        },
        document,
        source,
      );
      const updated = applySourceEdits(source, operation.edits);
      if (operation.unavailableReason || updated === source) {
        reportMessage(operation.unavailableReason ?? "That WBS subtree cannot be moved there");
        return;
      }
      commitSource(updated, `Move WBS subtree ${node.label}`);
      reportMessage(
        before ? `Reordered ${node.label}` : `Moved ${node.label}${parent ? ` under ${parent.label}` : " to the root"}`,
      );
    },
    [commitSource, document, reportMessage, source],
  );

  const createWbsRelationship = useCallback(
    (fromId: string, toId: string) => {
      const from = document.nodes.find((node) => node.id === fromId);
      const to = document.nodes.find((node) => node.id === toId);
      if (!from || !to || from.id === to.id) return;
      const updated = applyOperation(
        applicationWbsAdapter.applyVisualOperation(
          { kind: "create-relationship", fromNodeId: fromId, toNodeId: toId },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      commitSource(updated, `Connect ${from.label} to ${to.label}`);
      reportMessage(`Connected ${from.label} to ${to.label}`);
    },
    [applyOperation, commitSource, document, reportMessage, source],
  );

  const applyWbsRelationshipColor = useCallback(
    (color: string) => {
      if (!selectedRelationship) return;
      const updated = applyOperation(
        applicationWbsAdapter.applyVisualOperation(
          { kind: "update-relationship-color", relationshipId: selectedRelationship.id, color },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      commitSource(updated, `Update WBS arrow ${selectedRelationship.from} to ${selectedRelationship.to}`);
      reportMessage("Updated WBS arrow color");
    },
    [applyOperation, commitSource, document, reportMessage, selectedRelationship, source],
  );

  const reconnectWbsArrow = useCallback(
    (relationshipId: string, endpoint: "from" | "to", targetId: string) => {
      const relationship = document.relationships.find((item) => item.id === relationshipId);
      const target = document.nodes.find((item) => item.id === targetId);
      if (!relationship || !target) return;
      const updated = applyOperation(
        applicationWbsAdapter.applyVisualOperation(
          { kind: "reconnect-relationship", relationshipId, endpoint, targetNodeId: targetId },
          document,
          source,
        ),
      );
      if (updated === undefined) return;
      commitSource(updated, `Reconnect ${endpoint} end of WBS arrow`);
      reportMessage(`Reconnected WBS arrow to ${target.label}`);
    },
    [applyOperation, commitSource, document, reportMessage, source],
  );

  const removeWbsRelationship = useCallback(() => {
    if (!selectedRelationship) return;
    const updated = applyOperation(
      applicationWbsAdapter.applyVisualOperation(
        { kind: "delete-relationship", relationshipId: selectedRelationship.id },
        document,
        source,
      ),
    );
    if (updated === undefined) return;
    commitSource(updated, `Delete WBS arrow ${selectedRelationship.from} to ${selectedRelationship.to}`);
    clearSelectedRelationship();
    reportMessage("Deleted WBS arrow");
  }, [applyOperation, clearSelectedRelationship, commitSource, document, reportMessage, selectedRelationship, source]);

  const applyWbsSettings = useCallback(
    (value: { title: string }) => {
      let updated = source
        .replace(/^\s*title\s+.*(?:\r?\n)?/im, "")
        .replace(/^\s*(?:left side|right side|(?:left to right|top to bottom) direction)\s*(?:\r?\n)?/im, "");
      const start = /^\s*@startwbs\b.*$/im.exec(updated);
      if (!start) return;
      const at = start.index + start[0].length;
      const settings = value.title.trim() ? `\ntitle ${value.title.trim()}` : "";
      updated = `${updated.slice(0, at)}${settings}${updated.slice(at)}`;
      commitSource(updated, "Update WBS settings");
      reportMessage("Updated WBS settings");
    },
    [commitSource, reportMessage, source],
  );

  return {
    addWbsNode,
    applyWbsNode,
    removeWbsNode,
    moveWbsNode,
    createWbsRelationship,
    applyWbsRelationshipColor,
    reconnectWbsArrow,
    removeWbsRelationship,
    applyWbsSettings,
  };
}
