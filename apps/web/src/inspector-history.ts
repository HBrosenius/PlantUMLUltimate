import { createContext } from "react";

export const InspectorHistoryContext = createContext<{ canUndo: boolean; undo(): void } | undefined>(undefined);
