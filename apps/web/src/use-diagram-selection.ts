import { useCallback, useMemo, useReducer, type Dispatch, type SetStateAction } from "react";

export type DiagramSelectionState = {
  selectedTaskId: string | undefined;
  selectedDependencyIndex: number | undefined;
  selectedDividerIndex: number | undefined;
  selectedVerticalSeparatorIndex: number | undefined;
  selectedClassObjectId: string | undefined;
  sourceHighlightedTaskId: string | undefined;
  sourceHighlightedClassEntityId: string | undefined;
  sourceHighlightedClassMemberId: string | undefined;
};

export const initialDiagramSelectionState: DiagramSelectionState = {
  selectedTaskId: undefined,
  selectedDependencyIndex: undefined,
  selectedDividerIndex: undefined,
  selectedVerticalSeparatorIndex: undefined,
  selectedClassObjectId: undefined,
  sourceHighlightedTaskId: undefined,
  sourceHighlightedClassEntityId: undefined,
  sourceHighlightedClassMemberId: undefined,
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
    };
  }
  return {
    ...state,
    selectedTaskId: undefined,
    selectedDependencyIndex: undefined,
    selectedDividerIndex: undefined,
    selectedVerticalSeparatorIndex: undefined,
    selectedClassObjectId: undefined,
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
      setSelectedClassObjectId: setter("selectedClassObjectId"),
      setSourceHighlightedTaskId: setter("sourceHighlightedTaskId"),
      setSourceHighlightedClassEntityId: setter("sourceHighlightedClassEntityId"),
      setSourceHighlightedClassMemberId: setter("sourceHighlightedClassMemberId"),
    };
  }, []);
  const resetTransientTabSelection = useCallback(() => dispatch({ type: "reset-transient-tab-selection" }), []);
  const dismissInspectorSelection = useCallback(() => dispatch({ type: "dismiss-inspector-selection" }), []);
  return { ...state, ...setters, resetTransientTabSelection, dismissInspectorSelection };
}
