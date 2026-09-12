import { useCallback } from "react";
import {
  deleteUseCaseElement,
  deleteUseCaseNote,
  deleteUseCasePackage,
  deleteUseCaseRelationship,
  insertUseCaseElement,
  insertUseCaseNote,
  insertUseCasePackage,
  insertUseCaseRelationship,
  moveUseCaseElementToPackage,
  reorderUseCaseElement,
  updateUseCaseElement,
  updateUseCaseNote,
  updateUseCasePackage,
  updateUseCaseRelationship,
  type UseCaseDocument,
  type UseCaseElement,
  type UseCaseElementInput,
  type UseCaseNote,
  type UseCaseNoteInput,
  type UseCasePackage,
  type UseCasePackageInput,
  type UseCaseRelationship,
  type UseCaseRelationshipInput,
} from "@plantuml-studio/diagram-usecase";
import { updateUseCaseSettings, type UseCaseSettings } from "../../usecase-settings";

type UseCaseDialogKind = "element" | "relationship" | "package" | "note";

interface UseUseCaseActionsOptions {
  source: string;
  document: UseCaseDocument;
  selectedElement: UseCaseElement | undefined;
  selectedRelationship: UseCaseRelationship | undefined;
  selectedPackage: UseCasePackage | undefined;
  selectedNote: UseCaseNote | undefined;
  commitSource(source: string, description: string): boolean;
  confirmDelete(message: string): boolean;
  closeDialog(kind: UseCaseDialogKind): void;
  selectObject(id: string | undefined): void;
  reportMessage(message: string): void;
}

export function useUseCaseActions({
  source,
  document,
  selectedElement,
  selectedRelationship,
  selectedPackage,
  selectedNote,
  commitSource,
  confirmDelete,
  closeDialog,
  selectObject,
  reportMessage,
}: UseUseCaseActionsOptions) {
  const addUseCaseElement = useCallback(
    (value: UseCaseElementInput) => {
      commitSource(insertUseCaseElement(source, value), `Add ${value.kind} ${value.label.trim()}`);
      closeDialog("element");
      reportMessage(`Added ${value.kind === "actor" ? "actor" : "use case"} ${value.label.trim()}`);
    },
    [closeDialog, commitSource, reportMessage, source],
  );
  const applyUseCaseElement = useCallback(
    (value: UseCaseElementInput) => {
      if (!selectedElement) return;
      commitSource(
        updateUseCaseElement(source, document, selectedElement, value),
        `Update ${selectedElement.kind} ${selectedElement.label}`,
      );
      selectObject((value.alias?.trim() || value.label.trim()).toLowerCase());
    },
    [commitSource, document, selectedElement, selectObject, source],
  );
  const removeUseCaseElement = useCallback(() => {
    if (!selectedElement) return;
    const connected = document.relationships.filter(
      (item) => item.from === selectedElement.id || item.to === selectedElement.id,
    ).length;
    if (
      !confirmDelete(
        `Delete “${selectedElement.label}”${connected ? ` and ${connected} connected relationship${connected === 1 ? "" : "s"}` : ""}?`,
      )
    )
      return;
    commitSource(
      deleteUseCaseElement(source, document, selectedElement),
      `Delete ${selectedElement.kind} ${selectedElement.label}`,
    );
    selectObject(undefined);
  }, [commitSource, confirmDelete, document, selectedElement, selectObject, source]);

  const addUseCaseRelationship = useCallback(
    (value: UseCaseRelationshipInput) => {
      commitSource(insertUseCaseRelationship(source, document, value), "Add Use Case relationship");
      closeDialog("relationship");
      reportMessage("Added Use Case relationship");
    },
    [closeDialog, commitSource, document, reportMessage, source],
  );
  const applyUseCaseRelationship = useCallback(
    (value: UseCaseRelationshipInput) => {
      if (!selectedRelationship) return;
      if (
        !commitSource(
          updateUseCaseRelationship(source, document, selectedRelationship, value),
          "Update Use Case relationship",
        )
      )
        return;
      selectObject(selectedRelationship.id);
    },
    [commitSource, document, selectedRelationship, selectObject, source],
  );
  const removeUseCaseRelationship = useCallback(() => {
    if (!selectedRelationship) return;
    commitSource(deleteUseCaseRelationship(source, selectedRelationship), "Delete Use Case relationship");
    selectObject(undefined);
  }, [commitSource, selectedRelationship, selectObject, source]);

  const addUseCasePackage = useCallback(
    (value: UseCasePackageInput) => {
      commitSource(insertUseCasePackage(source, value), `Add ${value.kind} ${value.label.trim()}`);
      closeDialog("package");
    },
    [closeDialog, commitSource, source],
  );
  const applyUseCasePackage = useCallback(
    (value: UseCasePackageInput) => {
      if (!selectedPackage) return;
      commitSource(
        updateUseCasePackage(source, selectedPackage, value),
        `Update ${selectedPackage.kind} ${selectedPackage.label}`,
      );
      selectObject((value.alias?.trim() || value.label.trim()).toLowerCase());
    },
    [commitSource, selectedPackage, selectObject, source],
  );
  const removeUseCasePackage = useCallback(() => {
    if (!selectedPackage) return;
    commitSource(
      deleteUseCasePackage(source, selectedPackage),
      `Remove ${selectedPackage.kind} ${selectedPackage.label}`,
    );
    selectObject(undefined);
  }, [commitSource, selectedPackage, selectObject, source]);

  const addUseCaseNote = useCallback(
    (value: UseCaseNoteInput) => {
      commitSource(insertUseCaseNote(source, document, value), "Add Use Case note");
      closeDialog("note");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyUseCaseNote = useCallback(
    (value: UseCaseNoteInput) => {
      if (selectedNote) commitSource(updateUseCaseNote(source, document, selectedNote, value), "Update Use Case note");
    },
    [commitSource, document, selectedNote, source],
  );
  const removeUseCaseNote = useCallback(() => {
    if (!selectedNote) return;
    commitSource(deleteUseCaseNote(source, selectedNote), "Delete Use Case note");
    selectObject(undefined);
  }, [commitSource, selectedNote, selectObject, source]);

  const createUseCaseRelationshipByDrag = useCallback(
    (from: string, to: string) => {
      commitSource(
        insertUseCaseRelationship(source, document, { from, to, kind: "association" }),
        "Connect Use Case objects",
      );
      reportMessage("Added association");
    },
    [commitSource, document, reportMessage, source],
  );
  const reconnectUseCaseRelationshipByDrag = useCallback(
    (relationshipId: string, endpoint: "from" | "to", targetId: string) => {
      const relationship = document.relationships.find((item) => item.id === relationshipId);
      if (!relationship) return;
      const nextValue: UseCaseRelationshipInput = {
        from: endpoint === "from" ? targetId : relationship.from,
        to: endpoint === "to" ? targetId : relationship.to,
        kind: relationship.kind,
        arrow: relationship.arrow,
        ...(relationship.kind === "association" && relationship.label ? { label: relationship.label } : {}),
        ...(relationship.color ? { color: relationship.color } : {}),
        ...(relationship.lineStyle ? { lineStyle: relationship.lineStyle } : {}),
        ...(relationship.direction ? { direction: relationship.direction } : {}),
      };
      commitSource(
        updateUseCaseRelationship(source, document, relationship, nextValue),
        "Reconnect Use Case relationship",
      );
      reportMessage(`Reconnected ${endpoint} endpoint`);
    },
    [commitSource, document, reportMessage, source],
  );
  const moveUseCaseElementByDrag = useCallback(
    (elementId: string, packageId: string) => {
      const element = document.elements.find((item) => item.id === elementId);
      const target = document.packages.find((item) => item.id === packageId);
      if (!element || !target) return;
      commitSource(
        moveUseCaseElementToPackage(source, document, element, packageId),
        `Move ${element.label} into ${target.label}`,
      );
      reportMessage(`Moved ${element.label} into ${target.label}`);
    },
    [commitSource, document, reportMessage, source],
  );
  const moveSelectedUseCaseElementToPackage = useCallback(
    (packageId?: string) => {
      if (selectedElement)
        commitSource(
          moveUseCaseElementToPackage(source, document, selectedElement, packageId),
          `Move ${selectedElement.label}`,
        );
    },
    [commitSource, document, selectedElement, source],
  );
  const reorderUseCaseElementByDrag = useCallback(
    (elementId: string, targetId: string, placement: "before" | "after") => {
      const element = document.elements.find((item) => item.id === elementId);
      const target = document.elements.find((item) => item.id === targetId);
      if (!element || !target) return;
      const updated = reorderUseCaseElement(source, element, target, placement);
      if (updated === source) {
        reportMessage("Objects can be reordered only within the same container");
        return;
      }
      commitSource(updated, `Reorder ${element.label}`);
    },
    [commitSource, document.elements, reportMessage, source],
  );
  const applyUseCaseSettings = useCallback(
    (value: UseCaseSettings) => {
      commitSource(updateUseCaseSettings(source, value), "Update Use Case settings");
      reportMessage("Updated Use Case settings");
    },
    [commitSource, reportMessage, source],
  );

  return {
    addUseCaseElement,
    applyUseCaseElement,
    removeUseCaseElement,
    addUseCaseRelationship,
    applyUseCaseRelationship,
    removeUseCaseRelationship,
    addUseCasePackage,
    applyUseCasePackage,
    removeUseCasePackage,
    addUseCaseNote,
    applyUseCaseNote,
    removeUseCaseNote,
    createUseCaseRelationshipByDrag,
    reconnectUseCaseRelationshipByDrag,
    moveUseCaseElementByDrag,
    moveSelectedUseCaseElementToPackage,
    reorderUseCaseElementByDrag,
    applyUseCaseSettings,
  };
}
