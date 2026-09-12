import type {
  UseCaseElementInput,
  UseCaseElementKind,
  UseCaseNoteInput,
  UseCasePackageInput,
  UseCaseRelationshipInput,
} from "@plantuml-studio/diagram-usecase";
import { AddUseCaseElementDialog } from "../../AddUseCaseElementDialog";
import { AddUseCaseNoteDialog } from "../../AddUseCaseNoteDialog";
import { AddUseCasePackageDialog } from "../../AddUseCasePackageDialog";
import { AddUseCaseRelationshipDialog } from "../../AddUseCaseRelationshipDialog";

type ActiveUseCaseDialog =
  | { kind: "element"; elementKind: UseCaseElementKind }
  | { kind: "relationship" }
  | { kind: "package" }
  | { kind: "note" };

interface UseCaseDialogsProps {
  active: ActiveUseCaseDialog | undefined;
  elements: Array<{ id: string; label: string }>;
  onAddElement(value: UseCaseElementInput): void;
  onAddRelationship(value: UseCaseRelationshipInput): void;
  onAddPackage(value: UseCasePackageInput): void;
  onAddNote(value: UseCaseNoteInput): void;
  onClose(): void;
}

export function UseCaseDialogs({
  active,
  elements,
  onAddElement,
  onAddRelationship,
  onAddPackage,
  onAddNote,
  onClose,
}: UseCaseDialogsProps) {
  if (!active) return null;
  if (active.kind === "element")
    return <AddUseCaseElementDialog initialKind={active.elementKind} onAdd={onAddElement} onClose={onClose} />;
  if (active.kind === "relationship")
    return <AddUseCaseRelationshipDialog elements={elements} onAdd={onAddRelationship} onClose={onClose} />;
  if (active.kind === "package") return <AddUseCasePackageDialog onAdd={onAddPackage} onClose={onClose} />;
  return <AddUseCaseNoteDialog elements={elements} onAdd={onAddNote} onClose={onClose} />;
}
