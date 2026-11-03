import type { ComponentProps } from "react";
import { InspectorHistoryContext } from "./inspector-history";

export function InspectorWorkspace({
  history,
  ...props
}: ComponentProps<"div"> & {
  history: { canUndo: boolean; undo(): void };
}) {
  return (
    <InspectorHistoryContext.Provider value={history}>
      <div {...props} />
    </InspectorHistoryContext.Provider>
  );
}
