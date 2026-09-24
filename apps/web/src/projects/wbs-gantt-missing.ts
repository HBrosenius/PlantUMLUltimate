import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import type { WbsGanttLink } from "../wbs-gantt";

export interface WbsGanttMissingItem {
  kind: "wbs" | "gantt";
  key: string;
  label: string;
  documentId: string;
  counterpartDocumentId: string;
  diagramName: string;
}

export function collectMissingWbsGanttItems(
  wbs: { id: string; name: string; source: string },
  gantt: { id: string; name: string; source: string },
  links: readonly WbsGanttLink[],
): WbsGanttMissingItem[] {
  const linkedNodes = new Set(links.map((link) => link.wbsAlias));
  const linkedTasks = new Set(links.map((link) => link.ganttAlias.toLowerCase()));
  return [
    ...parseWbs(wbs.source)
      .nodes.filter((node) => !node.alias || !linkedNodes.has(node.alias))
      .map((node) => ({
        kind: "wbs" as const,
        key: node.id,
        label: node.label,
        documentId: wbs.id,
        counterpartDocumentId: gantt.id,
        diagramName: wbs.name,
      })),
    ...parseGantt(gantt.source)
      .document.tasks.filter((task) => !linkedTasks.has(task.id))
      .map((task) => ({
        kind: "gantt" as const,
        key: task.id,
        label: task.label,
        documentId: gantt.id,
        counterpartDocumentId: wbs.id,
        diagramName: gantt.name,
      })),
  ];
}
