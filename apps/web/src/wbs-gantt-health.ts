import { parseGantt } from "@plantuml-studio/diagram-gantt";
import { parseWbs } from "@plantuml-studio/diagram-wbs";
import { convertWbsToGantt, type WbsGanttLink } from "./wbs-gantt";

export interface WbsGanttIssue {
  message: string;
  diagram: "wbs" | "gantt";
  kind: "node" | "relationship" | "task" | "document";
  key?: string;
}

export function collectWbsGanttIssues(
  wbsSource: string,
  ganttSource: string,
  links: readonly WbsGanttLink[],
  importedDependencies: readonly { from: string; to: string }[] = [],
): WbsGanttIssue[] {
  const wbs = parseWbs(wbsSource);
  const gantt = parseGantt(ganttSource).document;
  const nodes = new Map(wbs.nodes.filter((node) => node.alias).map((node) => [node.alias!, node]));
  const issues: WbsGanttIssue[] = [];
  for (const link of links) {
    const node = nodes.get(link.wbsAlias);
    const task = gantt.symbols.tasks.get(link.ganttAlias.toLowerCase());
    if (!node)
      issues.push({
        message: `WBS node ${link.wbsAlias} is missing; its Gantt link is broken.`,
        diagram: "gantt",
        kind: task ? "task" : "document",
        ...(task ? { key: task.id } : {}),
      });
    if (!task && node)
      issues.push({
        message: `Gantt task ${link.ganttAlias} is missing; ${node.label} has a broken link.`,
        diagram: "wbs",
        kind: "node",
        key: node.id,
      });
  }
  const conversion = convertWbsToGantt(wbsSource, ganttSource, links, importedDependencies, "keep-scheduled", false);
  for (const relationship of wbs.relationships) {
    const warning = conversion.warnings.find((message) =>
      message.startsWith(`Dependency ${relationship.from} → ${relationship.to} `),
    );
    if (warning) issues.push({ message: warning, diagram: "wbs", kind: "relationship", key: relationship.id });
  }
  return issues;
}
