import { useCallback, useMemo, useReducer, type Dispatch, type SetStateAction } from "react";

export type DiagramSelectionState = {
  selectedTaskId: string | undefined;
  selectedDependencyIndex: number | undefined;
  selectedDividerIndex: number | undefined;
  selectedVerticalSeparatorIndex: number | undefined;
  selectedSequenceParticipantId: string | undefined;
  selectedSequenceMessageId: string | undefined;
  selectedSequenceStructureId: string | undefined;
  selectedUseCaseObjectId: string | undefined;
  selectedClassObjectId: string | undefined;
  selectedActivityObjectId: string | undefined;
  selectedWbsNodeId: string | undefined;
  selectedWbsRelationshipId: string | undefined;
  sourceHighlightedTaskId: string | undefined;
  sourceHighlightedSequenceParticipantId: string | undefined;
  sourceHighlightedUseCaseId: string | undefined;
  sourceHighlightedClassEntityId: string | undefined;
  sourceHighlightedClassMemberId: string | undefined;
  sourceHighlightedActivityId: string | undefined;
  sourceHighlightedWbsNodeId: string | undefined;
};

export const initialDiagramSelectionState: DiagramSelectionState = {
  selectedTaskId: undefined,
  selectedDependencyIndex: undefined,
  selectedDividerIndex: undefined,
  selectedVerticalSeparatorIndex: undefined,
  selectedSequenceParticipantId: undefined,
  selectedSequenceMessageId: undefined,
  selectedSequenceStructureId: undefined,
  selectedUseCaseObjectId: undefined,
  selectedClassObjectId: undefined,
  selectedActivityObjectId: undefined,
  selectedWbsNodeId: undefined,
  selectedWbsRelationshipId: undefined,
  sourceHighlightedTaskId: undefined,
  sourceHighlightedSequenceParticipantId: undefined,
  sourceHighlightedUseCaseId: undefined,
  sourceHighlightedClassEntityId: undefined,
  sourceHighlightedClassMemberId: undefined,
  sourceHighlightedActivityId: undefined,
  sourceHighlightedWbsNodeId: undefined,
};

type SetDiagramSelectionAction = {
  [K in keyof DiagramSelectionState]: {
    type: "set";
    key: K;
    value: SetStateAction<DiagramSelectionState[K]>;
  };
}[keyof DiagramSelectionState];

type DiagramSelectionAction =
  SetDiagramSelectionAction | { type: "reset-transient-tab-selection" } | { type: "dismiss-inspector-selection" };

export function diagramSelectionReducer(
  state: DiagramSelectionState,
  action: DiagramSelectionAction,
): DiagramSelectionState {
  if (action.type === "set") {
    const previous = state[action.key];
    const value =
      typeof action.value === "function"
        ? (action.value as (current: typeof previous) => typeof previous)(previous)
        : action.value;
    if (value === previous) return state;
    return { ...state, [action.key]: value };
  }
  if (action.type === "reset-transient-tab-selection") {
    return {
      ...state,
      selectedDependencyIndex: undefined,
      selectedSequenceParticipantId: undefined,
      selectedSequenceMessageId: undefined,
    };
  }
  return {
    ...state,
    selectedTaskId: undefined,
    selectedDependencyIndex: undefined,
    selectedDividerIndex: undefined,
    selectedVerticalSeparatorIndex: undefined,
    selectedSequenceParticipantId: undefined,
    selectedSequenceMessageId: undefined,
    selectedSequenceStructureId: undefined,
    selectedUseCaseObjectId: undefined,
    selectedClassObjectId: undefined,
    selectedActivityObjectId: undefined,
  };
}

type SelectionSetter<K extends keyof DiagramSelectionState> = Dispatch<SetStateAction<DiagramSelectionState[K]>>;

export function useDiagramSelection() {
  const [state, dispatch] = useReducer(diagramSelectionReducer, initialDiagramSelectionState);
  const setters = useMemo(() => {
    const setter =
      <K extends keyof DiagramSelectionState>(key: K): SelectionSetter<K> =>
      (value) =>
        dispatch({ type: "set", key, value } as SetDiagramSelectionAction);
    return {
      setSelectedTaskId: setter("selectedTaskId"),
      setSelectedDependencyIndex: setter("selectedDependencyIndex"),
      setSelectedDividerIndex: setter("selectedDividerIndex"),
      setSelectedVerticalSeparatorIndex: setter("selectedVerticalSeparatorIndex"),
      setSelectedSequenceParticipantId: setter("selectedSequenceParticipantId"),
      setSelectedSequenceMessageId: setter("selectedSequenceMessageId"),
      setSelectedSequenceStructureId: setter("selectedSequenceStructureId"),
      setSelectedUseCaseObjectId: setter("selectedUseCaseObjectId"),
      setSelectedClassObjectId: setter("selectedClassObjectId"),
      setSelectedActivityObjectId: setter("selectedActivityObjectId"),
      setSelectedWbsNodeId: setter("selectedWbsNodeId"),
      setSelectedWbsRelationshipId: setter("selectedWbsRelationshipId"),
      setSourceHighlightedTaskId: setter("sourceHighlightedTaskId"),
      setSourceHighlightedSequenceParticipantId: setter("sourceHighlightedSequenceParticipantId"),
      setSourceHighlightedUseCaseId: setter("sourceHighlightedUseCaseId"),
      setSourceHighlightedClassEntityId: setter("sourceHighlightedClassEntityId"),
      setSourceHighlightedClassMemberId: setter("sourceHighlightedClassMemberId"),
      setSourceHighlightedActivityId: setter("sourceHighlightedActivityId"),
      setSourceHighlightedWbsNodeId: setter("sourceHighlightedWbsNodeId"),
    };
  }, []);
  const resetTransientTabSelection = useCallback(() => dispatch({ type: "reset-transient-tab-selection" }), []);
  const dismissInspectorSelection = useCallback(() => dispatch({ type: "dismiss-inspector-selection" }), []);
  return { ...state, ...setters, resetTransientTabSelection, dismissInspectorSelection };
}
