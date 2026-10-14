import type { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates, resolveDateExpression } from "./gantt-schedule";

type Parsed = Pick<ReturnType<typeof parseGantt>, "document">;
function createContext(source: string, parsed: Parsed, timeZone?: string, dateAnchor?: string) {
  const calendar = parseGanttCalendar(source);
  let dates: ReturnType<typeof resolveTaskDates> | undefined;
  return {
    calendar,
    get dates() {
      return (dates ??= resolveTaskDates(
        parsed.document.tasks,
        parsed.document.dependencies,
        parsed.document.projectStart?.resolved ? parsed.document.projectStart.value : undefined,
        calendar,
        timeZone,
        dateAnchor,
      ));
    },
  };
}
export type GanttAnalysisContext = ReturnType<typeof createContext>;
// Models own the lifetime: neither previous edits nor candidate repairs are retained globally.
const contexts = new WeakMap<Parsed, Map<string, { source: string; value: GanttAnalysisContext }>>();
export function ganttAnalysisContext(source: string, parsed: Parsed, timeZone?: string): GanttAnalysisContext {
  const dateAnchor = resolveDateExpression("today", undefined, timeZone);
  const key = `${timeZone ?? "local"}:${dateAnchor}`;
  let entries = contexts.get(parsed);
  if (!entries) contexts.set(parsed, (entries = new Map()));
  const existing = entries.get(key);
  if (existing?.source === source) return existing.value;
  if (entries.size >= 4) entries.clear();
  const value = createContext(source, parsed, timeZone, dateAnchor);
  entries.set(key, { source, value });
  return value;
}
