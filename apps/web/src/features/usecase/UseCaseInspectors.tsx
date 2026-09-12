import type {
  UseCaseElement,
  UseCaseElementInput,
  UseCaseNote,
  UseCaseNoteInput,
  UseCasePackage,
  UseCasePackageInput,
  UseCaseRelationship,
  UseCaseRelationshipInput,
} from "@plantuml-studio/diagram-usecase";
import { UseCaseElementInspector } from "../../UseCaseElementInspector";
import { UseCaseNoteInspector } from "../../UseCaseNoteInspector";
import { UseCasePackageInspector } from "../../UseCasePackageInspector";
import { UseCaseRelationshipInspector } from "../../UseCaseRelationshipInspector";
import { UseCaseSettingsInspector } from "../../UseCaseSettingsInspector";
import type { UseCaseSettings } from "../../usecase-settings";

interface UseCaseInspectorsProps {
  settingsOpen: boolean;
  settings: UseCaseSettings;
  selectedElement: UseCaseElement | undefined;
  selectedRelationship: UseCaseRelationship | undefined;
  selectedPackage: UseCasePackage | undefined;
  selectedNote: UseCaseNote | undefined;
  elements: Array<{ id: string; label: string }>;
  packages: Array<{ id: string; label: string }>;
  onSettingsChange(value: UseCaseSettings): void;
  onElementChange(value: UseCaseElementInput): void;
  onElementDelete(): void;
  onElementPackageChange(packageId?: string): void;
  onRelationshipChange(value: UseCaseRelationshipInput): void;
  onRelationshipDelete(): void;
  onPackageChange(value: UseCasePackageInput): void;
  onPackageDelete(): void;
  onNoteChange(value: UseCaseNoteInput): void;
  onNoteDelete(): void;
  onCloseSettings(): void;
  onCloseSelection(): void;
}

export function UseCaseInspectors({
  settingsOpen,
  settings,
  selectedElement,
  selectedRelationship,
  selectedPackage,
  selectedNote,
  elements,
  packages,
  onSettingsChange,
  onElementChange,
  onElementDelete,
  onElementPackageChange,
  onRelationshipChange,
  onRelationshipDelete,
  onPackageChange,
  onPackageDelete,
  onNoteChange,
  onNoteDelete,
  onCloseSettings,
  onCloseSelection,
}: UseCaseInspectorsProps) {
  return (
    <>
      {settingsOpen && (
        <UseCaseSettingsInspector settings={settings} onChange={onSettingsChange} onClose={onCloseSettings} />
      )}
      {selectedElement && (
        <UseCaseElementInspector
          key={`${selectedElement.id}:${selectedElement.sourceRange.to}`}
          element={selectedElement}
          onChange={onElementChange}
          onDelete={onElementDelete}
          onClose={onCloseSelection}
          packages={packages}
          onPackageChange={onElementPackageChange}
        />
      )}
      {selectedRelationship && (
        <UseCaseRelationshipInspector
          key={`${selectedRelationship.id}:${selectedRelationship.sourceRange.to}`}
          relationship={selectedRelationship}
          elements={elements}
          onChange={onRelationshipChange}
          onDelete={onRelationshipDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedPackage && (
        <UseCasePackageInspector
          key={`${selectedPackage.id}:${selectedPackage.sourceRange.to}`}
          item={selectedPackage}
          onChange={onPackageChange}
          onDelete={onPackageDelete}
          onClose={onCloseSelection}
        />
      )}
      {selectedNote && (
        <UseCaseNoteInspector
          key={`${selectedNote.id}:${selectedNote.sourceRange.to}`}
          note={selectedNote}
          elements={elements}
          onChange={onNoteChange}
          onDelete={onNoteDelete}
          onClose={onCloseSelection}
        />
      )}
    </>
  );
}
