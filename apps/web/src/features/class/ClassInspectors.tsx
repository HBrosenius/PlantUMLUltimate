import type {
  ClassDocument,
  ClassEntity,
  ClassEntityInput,
  ClassMember,
  ClassMemberInput,
  ClassNote,
  ClassNoteInput,
  ClassPackage,
  ClassPackageInput,
  ClassRelationship,
  ClassRelationshipInput,
} from "@plantuml-studio/diagram-class";
import type { ClassSettings } from "../../class-settings";
import { ClassSettingsInspector } from "../../ClassSettingsInspector";
import {
  ClassEntityInspector,
  ClassNoteInspector,
  ClassPackageInspector,
  ClassRelationshipInspector,
} from "../../ClassEditors";

interface ClassInspectorsProps {
  componentMode?: boolean;
  settingsOpen: boolean;
  settings: ClassSettings;
  document: ClassDocument;
  selectedEntity: ClassEntity | undefined;
  selectedRelationship: ClassRelationship | undefined;
  selectedPackage: ClassPackage | undefined;
  selectedNote: ClassNote | undefined;
  onSettingsChange(value: ClassSettings): void;
  onEntityChange(value: ClassEntityInput): void;
  onEntityPackageChange(id?: string): void;
  onEntityDelete(): void;
  onMemberAdd(value: ClassMemberInput): void;
  onMemberChange(member: ClassMember, value: ClassMemberInput): void;
  onMemberDelete(member: ClassMember): void;
  onMemberMove(member: ClassMember, direction: -1 | 1): void;
  onMemberReveal(member: ClassMember): void;
  onRelationshipChange(value: ClassRelationshipInput): void;
  onRelationshipDelete(): void;
  onPackageChange(value: ClassPackageInput): void;
  onPackageParentChange(parentId?: string): void;
  onPackageDelete(): void;
  onNoteChange(value: ClassNoteInput): void;
  onNoteDelete(): void;
  onCloseSettings(): void;
  onCloseSelection(): void;
}

export function ClassInspectors({
  componentMode = false,
  settingsOpen,
  settings,
  document,
  selectedEntity,
  selectedRelationship,
  selectedPackage,
  selectedNote,
  onSettingsChange,
  onEntityChange,
  onEntityPackageChange,
  onEntityDelete,
  onMemberAdd,
  onMemberChange,
  onMemberDelete,
  onMemberMove,
  onMemberReveal,
  onRelationshipChange,
  onRelationshipDelete,
  onPackageChange,
  onPackageParentChange,
  onPackageDelete,
  onNoteChange,
  onNoteDelete,
  onCloseSettings,
  onCloseSelection,
}: ClassInspectorsProps) {
  return (
    <>
      {settingsOpen && (
        <ClassSettingsInspector
          componentMode={componentMode}
          settings={settings}
          onChange={onSettingsChange}
          onClose={onCloseSettings}
        />
      )}
      {selectedEntity && (
        <ClassEntityInspector
          componentMode={componentMode}
          entity={selectedEntity}
          entities={document.entities}
          packages={document.packages}
          onChange={onEntityChange}
          onPackageChange={onEntityPackageChange}
          onDelete={onEntityDelete}
          onMemberAdd={onMemberAdd}
          onMemberChange={onMemberChange}
          onMemberDelete={onMemberDelete}
          onMemberMove={onMemberMove}
          onMemberReveal={onMemberReveal}
          onClose={onCloseSelection}
        />
      )}
      {selectedRelationship && (
        <ClassRelationshipInspector
          key={selectedRelationship.id}
          componentMode={componentMode}
          item={selectedRelationship}
          document={document}
          onChange={onRelationshipChange}
          onDelete={onRelationshipDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedPackage && (
        <ClassPackageInspector
          componentMode={componentMode}
          item={selectedPackage}
          packages={document.packages}
          onChange={onPackageChange}
          onParentChange={onPackageParentChange}
          onDelete={onPackageDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedNote && (
        <ClassNoteInspector
          componentMode={componentMode}
          item={selectedNote}
          document={document}
          onChange={onNoteChange}
          onDelete={onNoteDelete}
          onClose={onCloseSelection}
        />
      )}
    </>
  );
}
