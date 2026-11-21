import { mindmapEditBlocker } from "@plantuml-studio/diagram-mindmap";
import type { AppDialog } from "../../use-app-dialog";
import { AddMindmapNodeDialog } from "./MindmapDialogs";
import { MindmapNodeInspector, MindmapSettingsInspector } from "./MindmapInspectors";
import type { MindmapEditor } from "./use-mindmap-editor";

/**
 * Every mindmap panel in one mount point: the add dialog, the settings inspector and the node
 * inspector. `DiagramDialogs` renders this for mindmap documents only.
 */
export function MindmapPanels({
  mindmap,
  dialog,
  closeDialog,
  multiple,
}: {
  mindmap: MindmapEditor;
  dialog: AppDialog | undefined;
  closeDialog(kind: AppDialog["kind"]): void;
  /** Several diagram elements are selected: the single-node inspector stays closed. */
  multiple: boolean;
}) {
  const { document, selectedNode, addTarget } = mindmap;
  return (
    <>
      {dialog?.kind === "add-mindmap-node" && (
        <AddMindmapNodeDialog
          selected={addTarget}
          hasRoot={document.roots.length > 0}
          sidesApply={mindmap.sidesApply}
          blocker={addTarget ? mindmapEditBlocker(document, addTarget) : undefined}
          initialPosition={dialog.position}
          onAdd={mindmap.addNode}
          onClose={() => closeDialog("add-mindmap-node")}
        />
      )}
      {mindmap.settingsOpen && (
        <MindmapSettingsInspector
          key={JSON.stringify(mindmap.settings)}
          document={document}
          initial={mindmap.settings}
          onApply={mindmap.applySettings}
          onConvert={mindmap.convertToOrgMode}
          onClose={mindmap.closeSettings}
        />
      )}
      {selectedNode && !multiple && (
        <MindmapNodeInspector
          key={selectedNode.id}
          node={selectedNode}
          sidesApply={mindmap.sidesApply}
          deleteBlocker={mindmap.deleteBlockerFor(selectedNode)}
          onApply={mindmap.applyNode}
          onToggleBoxless={mindmap.toggleBoxless}
          onSideChange={(side) => mindmap.setNodeSide(side)}
          onDelete={() => mindmap.removeNode()}
          onAddChild={() => mindmap.openAddNode("child")}
          onAddSibling={() => mindmap.openAddNode("sibling")}
          onConvert={mindmap.convertToOrgMode}
          onClose={mindmap.clearSelectedNode}
        />
      )}
    </>
  );
}
