import { useCallback, useRef, useState } from "react";
import { SourceHistory } from "@plantuml-studio/editor-core";

export function useDocumentHistory(activeDocumentId: string) {
  const histories = useRef(new Map<string, SourceHistory>());
  const [, setRevision] = useState(0);
  let active = histories.current.get(activeDocumentId);
  if (!active) {
    active = new SourceHistory();
    histories.current.set(activeDocumentId, active);
  }
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const remove = useCallback(
    (id: string) => {
      histories.current.delete(id);
      refresh();
    },
    [refresh],
  );
  const retain = useCallback(
    (ids: readonly string[]) => {
      const keep = new Set(ids);
      histories.current = new Map([...histories.current].filter(([id]) => keep.has(id)));
      refresh();
    },
    [refresh],
  );
  /** Records a change made to any open document, such as a linked document updated from the active one. */
  const recordSourceChange = useCallback(
    (id: string, before: string, after: string, description: string) => {
      let history = histories.current.get(id);
      if (!history) {
        history = new SourceHistory();
        histories.current.set(id, history);
      }
      history.record(before, after, description);
      refresh();
    },
    [refresh],
  );
  return {
    activeHistory: active,
    refreshHistoryControls: refresh,
    removeHistory: remove,
    retainHistories: retain,
    recordSourceChange,
  };
}
