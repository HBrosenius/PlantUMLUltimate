import { useMemo, useCallback, useEffect, type RefObject, type Dispatch, type SetStateAction } from "react";
import {
  createSemanticSymbolProvider,
  type SemanticSymbolOccurrence,
  type SemanticRenameRequest,
} from "../semantic-symbol-provider";
import { diagramFocusSelector } from "./diagram-focus";
import type { ActivityDocument } from "../../../../packages/diagram-activity/src/model";
import type { ClassDocument } from "../../../../packages/diagram-class/src/model";
import type { DiagramParseResult } from "../../../../packages/language-core/src/index";
import type { GanttDocument } from "../../../../packages/diagram-gantt/src/model";
import type { ViewMode } from "../model";
import type { SequenceDocument } from "../../../../packages/diagram-sequence/src/index";
import type { UseCaseDocument } from "../../../../packages/diagram-usecase/src/model";
import type { WbsDocument } from "../../../../packages/diagram-wbs/src/model";
import type { WorkspaceSnapshot } from "../workspace-storage";

export interface useSymbolNavigationInputs {
  activityDocument: ActivityDocument;
  classDocument: ClassDocument;
  lastDiagramFocus: RefObject<HTMLElement | SVGElement | undefined>;
  lastDiagramFocusSelector: RefObject<string | undefined>;
  parseResult: DiagramParseResult<GanttDocument>;
  renameReturnFocus: RefObject<HTMLElement | SVGElement | undefined>;
  selectViewMode: (mode: ViewMode) => void;
  sequenceDocument: SequenceDocument;
  setClassMemberMenu: Dispatch<
    SetStateAction<{ entityId: string; memberId: string; x: number; y: number } | undefined>
  >;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
  setRenameSymbol: Dispatch<SetStateAction<SemanticRenameRequest | undefined>>;
  setSelectionRequest: Dispatch<SetStateAction<{ from: number; to: number } | undefined>>;
  setSymbolMenu: Dispatch<
    SetStateAction<{ position?: number; occurrence?: SemanticSymbolOccurrence; x: number; y: number } | undefined>
  >;
  sourceSymbol: Pick<SemanticSymbolOccurrence, "kind" | "key"> | undefined;
  sourceSymbolPosition: number | undefined;
  useCaseDocument: UseCaseDocument;
  viewMode: ViewMode;
  wbsDocument: WbsDocument;
  workspace: WorkspaceSnapshot;
}

export function useSymbolNavigation({
  activityDocument,
  classDocument,
  lastDiagramFocus,
  lastDiagramFocusSelector,
  parseResult,
  renameReturnFocus,
  selectViewMode,
  sequenceDocument,
  setClassMemberMenu,
  setInteractionMessage,
  setRenameSymbol,
  setSelectionRequest,
  setSymbolMenu,
  sourceSymbol,
  sourceSymbolPosition,
  useCaseDocument,
  viewMode,
  wbsDocument,
  workspace,
}: useSymbolNavigationInputs) {
  const symbolProvider = useMemo(
    () =>
      createSemanticSymbolProvider({
        diagramKind: workspace.diagramKind,
        source: workspace.source,
        gantt: parseResult.document,
        sequence: sequenceDocument,
        useCase: useCaseDocument,
        classDiagram: classDocument,
        activity: activityDocument,
        wbs: wbsDocument,
      }),
    [
      activityDocument,
      classDocument,
      parseResult.document,
      sequenceDocument,
      useCaseDocument,
      wbsDocument,
      workspace.diagramKind,
      workspace.source,
    ],
  );
  const symbolOccurrences = symbolProvider.occurrences;
  const symbolHighlights = useMemo(
    () =>
      sourceSymbol
        ? symbolOccurrences
            .filter((item) => item.kind === sourceSymbol.kind && item.key === sourceSymbol.key)
            .map((item) => ({
              ...item.range,
              active:
                sourceSymbolPosition !== undefined &&
                sourceSymbolPosition >= item.range.from &&
                sourceSymbolPosition <= item.range.to,
            }))
        : [],
    [sourceSymbol, sourceSymbolPosition, symbolOccurrences],
  );
  const symbolAt = symbolProvider.occurrenceAt;
  const requestSymbolRename = useCallback(
    (position: number) => {
      const occurrence = symbolAt(position);
      if (!occurrence) return false;
      const request = symbolProvider.renameRequest(occurrence);
      if (!request) return false;
      const active = document.activeElement;
      if (active instanceof HTMLElement || active instanceof SVGElement) renameReturnFocus.current = active;
      setRenameSymbol(request);
      return true;
    },
    [renameReturnFocus, setRenameSymbol, symbolAt, symbolProvider],
  );
  const occurrencesFor = useCallback(
    (symbol: Pick<SemanticSymbolOccurrence, "kind" | "key">) => symbolProvider.occurrencesFor(symbol),
    [symbolProvider],
  );
  const navigateOccurrence = useCallback(
    (occurrence: SemanticSymbolOccurrence, direction: -1 | 1) => {
      const occurrences = occurrencesFor(occurrence);
      const currentIndex = occurrences.findIndex(
        (item) => item.range.from === occurrence.range.from && item.range.to === occurrence.range.to,
      );
      const next = occurrences[(Math.max(0, currentIndex) + direction + occurrences.length) % occurrences.length];
      if (next) {
        if (viewMode === "diagram") selectViewMode("split");
        setSelectionRequest({ ...next.range });
      }
    },
    [setSelectionRequest, occurrencesFor, selectViewMode, viewMode],
  );
  // Preview notices ask for a source line (e.g. a syntax error) without knowing which view is open.
  useEffect(() => {
    const reveal = (event: Event) => {
      const line = (event as CustomEvent<{ line?: number }>).detail?.line;
      const lines = workspace.source.split("\n");
      if (!line || line < 1 || line > lines.length) return;
      const from = lines.slice(0, line - 1).reduce((offset, text) => offset + text.length + 1, 0);
      if (viewMode === "diagram") selectViewMode("split");
      setSelectionRequest({ from, to: from + lines[line - 1]!.length });
    };
    window.addEventListener("reveal-source-line", reveal);
    return () => window.removeEventListener("reveal-source-line", reveal);
  }, [setSelectionRequest, selectViewMode, viewMode, workspace.source]);
  const diagramOccurrenceForTarget = useCallback(
    (target: Element): SemanticSymbolOccurrence | undefined => {
      const closestValue = (attribute: string) => target.closest(`[${attribute}]`)?.getAttribute(attribute);
      if (target instanceof SVGTextElement) {
        const text = target.textContent?.trim().replace(/^\{|\}$/g, "");
        const person = text
          ? symbolOccurrences.find(
              (item) => item.kind === "person" && item.value.toLocaleLowerCase() === text.toLocaleLowerCase(),
            )
          : undefined;
        if (person) return person;
      }
      const candidates: Array<{ kind: SemanticSymbolOccurrence["kind"]; key: string | null | undefined }> = [
        { kind: "task", key: closestValue("data-task-id") ?? closestValue("data-visual-task-id") },
        { kind: "participant", key: closestValue("data-sequence-participant-id") },
        {
          kind:
            closestValue("data-usecase-object-type") === "package" ||
            closestValue("data-usecase-object-type") === "rectangle"
              ? "usecase-package"
              : closestValue("data-usecase-object-type") === "actor"
                ? "actor"
                : "usecase",
          key: closestValue("data-usecase-object-id"),
        },
        {
          kind: closestValue("data-class-object-type") === "package" ? "class-package" : "class-entity",
          key: closestValue("data-class-object-id"),
        },
        {
          kind: closestValue("data-activity-object-type") === "action" ? "activity-action" : "activity-partition",
          key: closestValue("data-activity-object-id"),
        },
        { kind: "wbs-node", key: closestValue("data-wbs-node-id") },
      ];
      for (const candidate of candidates) {
        if (!candidate.key) continue;
        const occurrence = symbolOccurrences.find(
          (item) => item.kind === candidate.kind && item.key === candidate.key && item.role === "declaration",
        );
        if (occurrence) return occurrence;
      }
      return undefined;
    },
    [symbolOccurrences],
  );
  const openDiagramSymbolMenu = useCallback(
    (target: Element, x: number, y: number) => {
      const occurrence = diagramOccurrenceForTarget(target);
      if (!occurrence) return false;
      const focusTarget = target.closest<HTMLElement | SVGElement>("[tabindex], button");
      if (focusTarget) {
        lastDiagramFocus.current = focusTarget;
        lastDiagramFocusSelector.current = diagramFocusSelector(target);
        renameReturnFocus.current = focusTarget;
      }
      const bounds = target.getBoundingClientRect();
      setSymbolMenu({
        occurrence,
        x: x || bounds.left + Math.min(24, bounds.width / 2),
        y: y || bounds.top + Math.min(24, bounds.height),
      });
      return true;
    },
    [
      lastDiagramFocus,
      lastDiagramFocusSelector,
      renameReturnFocus,
      setSymbolMenu,
      setSymbolMenu,
      diagramOccurrenceForTarget,
    ],
  );
  const openClassMemberMenu = useCallback(
    (target: Element, x: number, y: number) => {
      const element = target.closest("[data-class-member-id]");
      const memberId = element?.getAttribute("data-class-member-id");
      const entityId = element?.getAttribute("data-class-object-id");
      if (!element || !memberId || !entityId) return false;
      const bounds = element.getBoundingClientRect();
      setClassMemberMenu({
        entityId,
        memberId,
        x: x || bounds.left + Math.min(24, bounds.width / 2),
        y: y || bounds.top + Math.min(24, bounds.height),
      });
      return true;
    },
    [setClassMemberMenu],
  );
  const reportFileError = useCallback(
    (error: unknown) => {
      setInteractionMessage(error instanceof Error ? error.message : "File operation failed");
    },
    [setInteractionMessage],
  );

  return {
    symbolProvider,
    symbolOccurrences,
    symbolHighlights,
    symbolAt,
    requestSymbolRename,
    occurrencesFor,
    navigateOccurrence,
    openDiagramSymbolMenu,
    openClassMemberMenu,
    reportFileError,
  };
}
