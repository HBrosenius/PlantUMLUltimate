import type {
  SemanticRenameRequest,
  SemanticSymbolOccurrence,
  SemanticSymbolProvider,
} from "../semantic-symbol-provider";
import type { WbsNode, WbsDocument } from "../../../../packages/diagram-wbs/src/model";
import type { Dispatch, SetStateAction } from "react";

export interface buildApplySemanticRenameInputs {
  commandReadOnly: boolean;
  commitGeneratedSource: (
    source: string,
    description: string,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  commitSource: (
    source: string,
    description: string,
    validate?: boolean,
    forecastChange?: {
      before: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string } | undefined;
      after: { enabled: boolean; remainingDays: Record<string, number>; asOf?: string; timeZone?: string };
    },
  ) => boolean;
  mapWbsProjectEdit: (node: WbsNode, source: string) => void;
  referenceSymbol: { kind: SemanticSymbolOccurrence["kind"]; key: string; label: string } | undefined;
  renameCapacity: (currentName: string, nextName: string) => void;
  restoreRenamedDiagramFocus: (kind: SemanticSymbolOccurrence["kind"], key: string | undefined) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setReferenceSymbol: Dispatch<
    SetStateAction<{ kind: SemanticSymbolOccurrence["kind"]; key: string; label: string } | undefined>
  >;
  setResourceFilter: Dispatch<SetStateAction<string>>;
  setSourceHighlightedActivityId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedClassEntityId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedSequenceParticipantId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedUseCaseId: Dispatch<SetStateAction<string | undefined>>;
  setSourceHighlightedWbsNodeId: Dispatch<SetStateAction<string | undefined>>;
  symbolProvider: SemanticSymbolProvider;
  wbsDocument: WbsDocument;
}

export function buildApplySemanticRename({
  commandReadOnly,
  commitGeneratedSource,
  commitSource,
  mapWbsProjectEdit,
  referenceSymbol,
  renameCapacity,
  restoreRenamedDiagramFocus,
  setInteractionMessage,
  setReferenceSymbol,
  setResourceFilter,
  setSourceHighlightedActivityId,
  setSourceHighlightedClassEntityId,
  setSourceHighlightedSequenceParticipantId,
  setSourceHighlightedUseCaseId,
  setSourceHighlightedWbsNodeId,
  symbolProvider,
  wbsDocument,
}: buildApplySemanticRenameInputs) {
  const applySemanticRename = (target: SemanticRenameRequest, nextValue: string): boolean => {
    if (commandReadOnly) return false;
    const result = symbolProvider.rename(target, nextValue);
    if (result.error || !result.source) {
      setInteractionMessage(result.error ?? "Rename made no changes");
      return false;
    }
    if (result.validateGenerated) {
      if (!commitGeneratedSource(result.source, `Rename ${target.mode}`)) return false;
    } else commitSource(result.source, `Rename ${target.mode}`);
    if (target.occurrence.kind === "wbs-node") {
      const node = wbsDocument.nodes.find((item) => item.id === target.occurrence.key);
      if (node) mapWbsProjectEdit(node, result.source);
    }
    if (result.personRename) {
      renameCapacity(result.personRename.from, result.personRename.to);
      setResourceFilter((current) =>
        current.toLocaleLowerCase() === result.personRename!.from.toLocaleLowerCase()
          ? result.personRename!.to
          : current,
      );
    }
    if (result.nextKey) {
      if (target.occurrence.kind === "participant") setSourceHighlightedSequenceParticipantId(result.nextKey);
      else if (target.occurrence.kind === "actor" || target.occurrence.kind === "usecase")
        setSourceHighlightedUseCaseId(result.nextKey);
      else if (target.occurrence.kind === "class-entity") setSourceHighlightedClassEntityId(result.nextKey);
      else if (target.occurrence.kind === "activity-action" || target.occurrence.kind === "activity-partition")
        setSourceHighlightedActivityId(result.nextKey);
      else if (target.occurrence.kind === "wbs-node") setSourceHighlightedWbsNodeId(result.nextKey);
    }
    if (referenceSymbol?.kind === target.occurrence.kind && referenceSymbol.key === target.occurrence.key)
      setReferenceSymbol({
        kind: target.occurrence.kind,
        key: result.nextKey ?? target.occurrence.key,
        label: nextValue.trim(),
      });
    setInteractionMessage(`Renamed ${target.occurrence.value} to ${nextValue.trim()}`);
    restoreRenamedDiagramFocus(target.occurrence.kind, result.nextKey);
    return true;
  };

  return { applySemanticRename };
}
