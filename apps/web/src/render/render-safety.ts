import { MAX_SOURCE_CHARS, parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseGanttCalendar } from "../gantt-calendar";

export function renderSafetyError(source: string): string | undefined {
  if (source.length > MAX_SOURCE_CHARS) return "Diagram source exceeds 500,000 characters";
  if (!/^\s*@startgantt\b/im.test(source)) return undefined;
  const parsed = parseGantt(source);
  const limit = parsed.diagnostics.find((d) => d.code === "resource-limit");
  return limit?.message ?? parseGanttCalendar(source).error;
}
