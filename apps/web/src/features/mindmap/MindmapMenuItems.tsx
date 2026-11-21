import { mindmapEditBlocker } from "@plantuml-studio/diagram-mindmap";
import type { MindmapEditor } from "./use-mindmap-editor";

/** The mindmap entries of the node context menu, next to the shared Rename and Find references. */
export function MindmapMenuItems({
  mindmap,
  nodeId,
  readOnly,
  onDone,
}: {
  mindmap: MindmapEditor;
  nodeId: string;
  readOnly: boolean;
  onDone(): void;
}) {
  const node = mindmap.document.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const blocker = mindmapEditBlocker(mindmap.document, node);
  const deleteBlocker = mindmap.deleteBlockerFor(node);
  const run = (action: () => void) => () => {
    action();
    onDone();
  };
  return (
    <>
      <button
        role="menuitem"
        disabled={readOnly || Boolean(blocker)}
        title={blocker}
        onClick={run(() => mindmap.openAddNode("child", node.id))}
      >
        Add child…
      </button>
      {node.depth > 1 && (
        <button
          role="menuitem"
          disabled={readOnly || Boolean(blocker)}
          title={blocker}
          onClick={run(() => mindmap.openAddNode("sibling", node.id))}
        >
          Add sibling…
        </button>
      )}
      {node.depth === 2 && mindmap.sidesApply && (
        <button
          role="menuitem"
          disabled={readOnly || Boolean(blocker)}
          title={blocker}
          onClick={run(() => mindmap.setNodeSide(node.side === "left" ? "right" : "left", node))}
        >
          Move to the {node.side === "left" ? "right" : "left"} side
        </button>
      )}
      <button
        role="menuitem"
        disabled={readOnly || Boolean(deleteBlocker)}
        title={deleteBlocker}
        onClick={run(() => mindmap.removeNode(node))}
      >
        Delete subtree
      </button>
    </>
  );
}
