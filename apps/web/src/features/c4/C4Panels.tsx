import type { AppDialog } from "../../use-app-dialog";
import { InlineLabelEditor } from "../../InlineLabelEditor";
import { AddC4BoundaryDialog, AddC4ElementDialog, AddC4RelationshipDialog } from "./C4Dialogs";
import { C4ElementInspector, C4RelationshipInspector, C4SettingsInspector, C4UnmanagedInspector } from "./C4Inspectors";
import type { C4Editor } from "./use-c4-editor";

/**
 * Every C4 panel in one mount point: the add dialogs, the inspectors and the inline label editor.
 * `DiagramDialogs` renders this for C4 documents only.
 */
export function C4Panels({
  c4,
  dialog,
  closeDialog,
  multiple,
}: {
  c4: C4Editor;
  dialog: AppDialog | undefined;
  closeDialog(kind: AppDialog["kind"]): void;
  /** Several diagram elements are selected: the single-object inspectors stay closed. */
  multiple: boolean;
}) {
  const { document, source, selectedElement, selectedRelationship, selectedUnmanaged, inlineRename } = c4;
  return (
    <>
      {dialog?.kind === "add-c4-element" && (
        <AddC4ElementDialog
          initialKind={dialog.elementKind}
          source={source}
          document={document}
          onAdd={c4.addElement}
          onClose={() => closeDialog("add-c4-element")}
        />
      )}
      {dialog?.kind === "add-c4-boundary" && (
        <AddC4BoundaryDialog
          initialMacro={dialog.boundaryKind ?? "System_Boundary"}
          source={source}
          document={document}
          onAdd={c4.addBoundary}
          onClose={() => closeDialog("add-c4-boundary")}
        />
      )}
      {dialog?.kind === "add-c4-relationship" && (
        <AddC4RelationshipDialog
          source={source}
          document={document}
          onAdd={c4.addRelationship}
          onClose={() => closeDialog("add-c4-relationship")}
        />
      )}
      {c4.settingsOpen && (
        <C4SettingsInspector document={document} onApply={c4.applySettings} onClose={c4.closeSettings} />
      )}
      {selectedElement && !multiple && (
        <C4ElementInspector
          key={selectedElement.id}
          element={selectedElement}
          document={document}
          onUpdate={(parameter, value) =>
            c4.updateArgument({ kind: "element", alias: selectedElement.id }, parameter, value)
          }
          onMacro={(macro) => c4.changeMacro(selectedElement.id, macro)}
          onMove={(parent) => c4.moveElement(selectedElement.id, parent)}
          onDelete={() => void c4.removeElement(selectedElement)}
          onClose={c4.clearSelection}
        />
      )}
      {selectedRelationship && !multiple && (
        <C4RelationshipInspector
          key={selectedRelationship.index}
          relationship={selectedRelationship}
          document={document}
          onUpdate={(parameter, value) =>
            c4.updateArgument({ kind: "relationship", index: selectedRelationship.index }, parameter, value)
          }
          onDirection={(direction) => c4.setDirection(selectedRelationship.index, direction)}
          onReverse={() => c4.reverse(selectedRelationship.index)}
          onBothWays={(both) => c4.setBothWays(selectedRelationship.index, selectedRelationship.macro, both)}
          onDelete={() => void c4.removeRelationship(selectedRelationship)}
          onClose={c4.clearSelection}
        />
      )}
      {selectedUnmanaged && !multiple && <C4UnmanagedInspector item={selectedUnmanaged} onClose={c4.clearSelection} />}
      {inlineRename && (
        <InlineLabelEditor
          value={inlineRename.value}
          anchor={inlineRename.anchor}
          current={source === inlineRename.source}
          validate={c4.validateInlineRename}
          onApply={c4.applyInlineRename}
          onClose={c4.closeInlineRename}
        />
      )}
    </>
  );
}
