import type {
  ClassDocument,
  ClassEntityInput,
  ClassNoteInput,
  ClassPackageInput,
  ClassRelationshipInput,
} from "@plantuml-studio/diagram-class";
import {
  AddClassEntityDialog,
  AddClassNoteDialog,
  AddClassPackageDialog,
  AddClassRelationshipDialog,
} from "../../ClassEditors";

export type ClassDialogKind = "entity" | "relationship" | "package" | "note";

interface ClassDialogsProps {
  active: ClassDialogKind | undefined;
  document: ClassDocument;
  onAddEntity(value: ClassEntityInput): void;
  onAddRelationship(value: ClassRelationshipInput): void;
  onAddPackage(value: ClassPackageInput): void;
  onAddNote(value: ClassNoteInput): void;
  onClose(): void;
}

export function ClassDialogs({
  active,
  document,
  onAddEntity,
  onAddRelationship,
  onAddPackage,
  onAddNote,
  onClose,
}: ClassDialogsProps) {
  if (active === "entity") return <AddClassEntityDialog onAdd={onAddEntity} onClose={onClose} />;
  if (active === "relationship")
    return <AddClassRelationshipDialog document={document} onAdd={onAddRelationship} onClose={onClose} />;
  if (active === "package") return <AddClassPackageDialog document={document} onAdd={onAddPackage} onClose={onClose} />;
  if (active === "note") return <AddClassNoteDialog document={document} onAdd={onAddNote} onClose={onClose} />;
  return null;
}
