import { useCallback } from "react";
import {
  deleteClassEntity,
  deleteClassMember,
  deleteClassNote,
  deleteClassPackage,
  deleteClassRelationship,
  insertClassEntity,
  insertClassMember,
  insertClassNote,
  insertClassPackage,
  insertClassRelationship,
  moveClassEntityToPackage,
  moveClassPackageToPackage,
  parseClassDiagram,
  reorderClassEntity,
  reorderClassMember,
  updateClassEntity,
  updateClassMember,
  updateClassNote,
  updateClassPackage,
  updateClassRelationship,
  type ClassDocument,
  type ClassEntity,
  type ClassEntityInput,
  type ClassMember,
  type ClassMemberInput,
  type ClassNote,
  type ClassNoteInput,
  type ClassPackage,
  type ClassPackageInput,
  type ClassRelationship,
  type ClassRelationshipInput,
} from "@plantuml-studio/diagram-class";
import { updateClassSettings, type ClassSettings } from "../../class-settings";
import type { ClassDialogKind } from "./ClassDialogs";

interface UseClassActionsOptions {
  componentMode?: boolean;
  source: string;
  document: ClassDocument;
  selectedEntity: ClassEntity | undefined;
  selectedRelationship: ClassRelationship | undefined;
  selectedPackage: ClassPackage | undefined;
  selectedNote: ClassNote | undefined;
  commitSource(source: string, description: string): boolean;
  mapProjectRename(
    kind: "class-entity",
    from: number,
    declaration: { symbolKey: string; from: number; to: number },
    source: string,
  ): Promise<void>;
  closeDialog(kind: ClassDialogKind): void;
  selectObject(id: string | undefined): void;
  reportMessage(message: string): void;
}

export function useClassActions(options: UseClassActionsOptions) {
  const {
    componentMode = false,
    source,
    document,
    selectedEntity,
    selectedRelationship,
    selectedPackage,
    selectedNote,
    commitSource,
    mapProjectRename,
    closeDialog,
    selectObject,
    reportMessage,
  } = options;

  const createClassRelationshipByDrag = useCallback(
    (from: string, to: string) => {
      commitSource(
        insertClassRelationship(source, document, { from, to, kind: "association" }),
        componentMode ? "Connect components" : "Connect Class objects",
      );
      reportMessage(componentMode ? "Added Component connection" : "Added Class association");
    },
    [commitSource, componentMode, document, reportMessage, source],
  );
  const reconnectClassRelationshipByDrag = useCallback(
    (id: string, endpoint: "from" | "to", targetId: string) => {
      const relationship = document.relationships.find((item) => item.id === id);
      if (!relationship) return;
      commitSource(
        updateClassRelationship(source, document, relationship, {
          from: endpoint === "from" ? targetId : relationship.from,
          to: endpoint === "to" ? targetId : relationship.to,
          kind: relationship.kind,
          ...(relationship.label ? { label: relationship.label } : {}),
          ...(relationship.fromMultiplicity ? { fromMultiplicity: relationship.fromMultiplicity } : {}),
          ...(relationship.toMultiplicity ? { toMultiplicity: relationship.toMultiplicity } : {}),
          ...(relationship.color ? { color: relationship.color } : {}),
          ...(relationship.lineStyle ? { lineStyle: relationship.lineStyle } : {}),
          arrow: relationship.arrow,
        }),
        "Reconnect Class relationship",
      );
    },
    [commitSource, document, source],
  );
  const moveClassEntityByDrag = useCallback(
    (id: string, packageId?: string) => {
      const entity = document.entities.find((item) => item.id === id);
      if (entity) commitSource(moveClassEntityToPackage(source, document, entity, packageId), "Move Class object");
    },
    [commitSource, document, source],
  );
  const reorderClassEntityByDrag = useCallback(
    (id: string, targetId: string, placement: "before" | "after") => {
      const entity = document.entities.find((item) => item.id === id);
      const target = document.entities.find((item) => item.id === targetId);
      if (entity && target)
        commitSource(reorderClassEntity(source, entity, target, placement), "Reorder Class objects");
    },
    [commitSource, document.entities, source],
  );
  const addClassEntity = useCallback(
    (value: ClassEntityInput) => {
      commitSource(insertClassEntity(source, value), "Add Class object");
      closeDialog("entity");
    },
    [closeDialog, commitSource, source],
  );
  const applyClassEntity = useCallback(
    (value: ClassEntityInput) => {
      if (!selectedEntity) return;
      const next = updateClassEntity(source, document, selectedEntity, value);
      const key = value.alias?.trim() || value.label.trim();
      const updated = parseClassDiagram(next).entities.find((item) => item.id === key || item.alias === key);
      if (updated)
        void mapProjectRename(
          "class-entity",
          selectedEntity.sourceRange.from,
          { symbolKey: key, ...updated.sourceRange },
          next,
        );
      commitSource(next, "Update Class object");
    },
    [commitSource, document, mapProjectRename, selectedEntity, source],
  );
  const removeClassEntity = useCallback(() => {
    if (!selectedEntity) return;
    commitSource(deleteClassEntity(source, document, selectedEntity), "Delete Class object");
    selectObject(undefined);
  }, [commitSource, document, selectObject, selectedEntity, source]);
  const addClassMember = useCallback(
    (value: ClassMemberInput) => {
      if (selectedEntity) commitSource(insertClassMember(source, selectedEntity, value), "Add Class member");
    },
    [commitSource, selectedEntity, source],
  );
  const applyClassMember = useCallback(
    (member: ClassMember, value: ClassMemberInput) =>
      commitSource(updateClassMember(source, member, value), "Update Class member"),
    [commitSource, source],
  );
  const removeClassMember = useCallback(
    (member: ClassMember) => {
      if (selectedEntity) commitSource(deleteClassMember(source, selectedEntity, member), "Delete Class member");
    },
    [commitSource, selectedEntity, source],
  );
  const moveClassMember = useCallback(
    (member: ClassMember, direction: -1 | 1) => {
      if (!selectedEntity) return;
      const index = selectedEntity.members.findIndex((candidate) => candidate.id === member.id);
      const target = selectedEntity.members[index + direction];
      if (target) commitSource(reorderClassMember(source, member, target), "Reorder Class members");
    },
    [commitSource, selectedEntity, source],
  );
  const addClassRelationship = useCallback(
    (value: ClassRelationshipInput) => {
      commitSource(insertClassRelationship(source, document, value), "Add Class relationship");
      closeDialog("relationship");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyClassRelationship = useCallback(
    (value: ClassRelationshipInput) => {
      if (selectedRelationship)
        commitSource(
          updateClassRelationship(source, document, selectedRelationship, value),
          "Update Class relationship",
        );
    },
    [commitSource, document, selectedRelationship, source],
  );
  const removeClassRelationship = useCallback(() => {
    if (!selectedRelationship) return;
    commitSource(deleteClassRelationship(source, selectedRelationship, document), "Delete Class relationship");
    selectObject(undefined);
  }, [commitSource, document, selectObject, selectedRelationship, source]);
  const addClassPackage = useCallback(
    (value: ClassPackageInput) => {
      commitSource(insertClassPackage(source, document, value), "Add Class package");
      closeDialog("package");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyClassPackage = useCallback(
    (value: ClassPackageInput) => {
      if (selectedPackage) commitSource(updateClassPackage(source, selectedPackage, value), "Update Class package");
    },
    [commitSource, selectedPackage, source],
  );
  const removeClassPackage = useCallback(() => {
    if (!selectedPackage) return;
    commitSource(deleteClassPackage(source, selectedPackage), "Delete Class package");
    selectObject(undefined);
  }, [commitSource, selectObject, selectedPackage, source]);
  const moveSelectedClassPackage = useCallback(
    (parentId?: string) => {
      if (selectedPackage)
        commitSource(moveClassPackageToPackage(source, document, selectedPackage, parentId), "Move Class package");
    },
    [commitSource, document, selectedPackage, source],
  );
  const moveSelectedClassEntity = useCallback(
    (id?: string) => {
      if (selectedEntity)
        commitSource(moveClassEntityToPackage(source, document, selectedEntity, id), "Move Class object");
    },
    [commitSource, document, selectedEntity, source],
  );
  const applyClassSettings = useCallback(
    (value: ClassSettings) => {
      commitSource(
        updateClassSettings(source, value),
        componentMode ? "Update Component settings" : "Update Class settings",
      );
      reportMessage(componentMode ? "Updated Component settings" : "Updated Class settings");
    },
    [commitSource, componentMode, reportMessage, source],
  );
  const addClassNote = useCallback(
    (value: ClassNoteInput) => {
      commitSource(insertClassNote(source, document, value), "Add Class note");
      closeDialog("note");
    },
    [closeDialog, commitSource, document, source],
  );
  const applyClassNote = useCallback(
    (value: ClassNoteInput) => {
      if (!selectedNote) return;
      const next = updateClassNote(source, document, selectedNote, value);
      const updated = parseClassDiagram(next).notes.find(
        (note) =>
          note.targetId === value.targetId &&
          note.text === value.text.trim() &&
          (note.color ?? "").toLowerCase() === (value.color ? `#${value.color.replace(/^#/, "")}` : "").toLowerCase(),
      );
      commitSource(next, "Update Class note");
      if (updated) selectObject(updated.id);
    },
    [commitSource, document, selectObject, selectedNote, source],
  );
  const removeClassNote = useCallback(() => {
    if (!selectedNote) return;
    commitSource(deleteClassNote(source, selectedNote), "Delete Class note");
    selectObject(undefined);
  }, [commitSource, selectObject, selectedNote, source]);

  return {
    createClassRelationshipByDrag,
    reconnectClassRelationshipByDrag,
    moveClassEntityByDrag,
    reorderClassEntityByDrag,
    addClassEntity,
    applyClassEntity,
    removeClassEntity,
    addClassMember,
    applyClassMember,
    removeClassMember,
    moveClassMember,
    addClassRelationship,
    applyClassRelationship,
    removeClassRelationship,
    addClassPackage,
    applyClassPackage,
    removeClassPackage,
    moveSelectedClassPackage,
    moveSelectedClassEntity,
    applyClassSettings,
    addClassNote,
    applyClassNote,
    removeClassNote,
  };
}
