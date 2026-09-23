import { parseWbs, type WbsNode } from "@plantuml-studio/diagram-wbs";
import { applySourceEdits, deleteTask, parseGantt, removeDependency, renameTask } from "@plantuml-studio/diagram-gantt";
import type { ResolvedTaskDates } from "./gantt-schedule";

export interface WbsGanttLink {
  wbsAlias: string;
  ganttAlias: string;
}

export interface WbsGanttConversion {
  wbsSource: string;
  ganttSource: string;
  links: WbsGanttLink[];
  dependencies: Array<{ from: string; to: string }>;
  warnings: string[];
}

const safeAlias = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[^A-Za-z_]/, "_$&");
const safeLabel = (value: string) => value.replaceAll("]", ")").replaceAll("\n", " ").trim();
const hierarchyLabel = (node: WbsNode) => `${"↳ ".repeat(Math.max(0, node.depth - 1))}${safeLabel(node.label)}`;

/** Give every WBS node a persistent identity before establishing cross-diagram links. */
export function ensureWbsAliases(source: string): string {
  const document = parseWbs(source);
  const used = new Set(document.nodes.flatMap((node) => (node.alias ? [node.alias] : [])));
  let next = source;
  for (const node of [...document.nodes].reverse()) {
    if (node.alias) continue;
    const base = safeAlias(node.label.toLowerCase().replace(/\s+/g, "_")).slice(0, 32) || "work";
    let alias = base;
    for (let index = 2; used.has(alias); index += 1) alias = `${base}_${index}`;
    used.add(alias);
    const at =
      node.sourceRange.from +
      source.slice(node.sourceRange.from, node.sourceRange.to).search(/[*+-]+/) +
      node.marker.length;
    next = `${next.slice(0, at)}(${alias})${next.slice(at)}`;
  }
  return next;
}

function cyclic(from: string, to: string, edges: Map<string, Set<string>>): boolean {
  if (from === to) return true;
  const seen = new Set<string>();
  const visit = (at: string): boolean => {
    if (at === from) return true;
    if (seen.has(at)) return false;
    seen.add(at);
    return [...(edges.get(at) ?? [])].some(visit);
  };
  return visit(to);
}

export function convertWbsToGantt(
  source: string,
  existingGanttSource?: string,
  existingLinks: readonly WbsGanttLink[] = [],
  importedDependencies: readonly { from: string; to: string }[] = [],
): WbsGanttConversion {
  const wbsSource = ensureWbsAliases(source);
  const document = parseWbs(wbsSource);
  const priorLinks = new Map(existingLinks.map((link) => [link.wbsAlias, link.ganttAlias]));
  let synchronizedSource = existingGanttSource;
  if (synchronizedSource) {
    const currentAliases = new Set(document.nodes.map((node) => node.alias));
    for (const link of existingLinks) {
      if (currentAliases.has(link.wbsAlias) || link.ganttAlias !== `wbs_${link.wbsAlias}`) continue;
      const parsed = parseGantt(synchronizedSource).document;
      const task = parsed.symbols.tasks.get(link.ganttAlias.toLowerCase());
      if (!task) continue;
      const removal = deleteTask(synchronizedSource, parsed, task);
      if (!removal.unavailableReason) synchronizedSource = applySourceEdits(synchronizedSource, removal.edits);
    }
    for (const node of document.nodes) {
      const parsed = parseGantt(synchronizedSource).document;
      const task = parsed.symbols.tasks.get((priorLinks.get(node.alias!) ?? `wbs_${node.alias}`).toLowerCase());
      const label = hierarchyLabel(node);
      if (!task || task.label === label) continue;
      const rename = renameTask(synchronizedSource, parsed, task, label);
      if (!rename.unavailableReason) synchronizedSource = applySourceEdits(synchronizedSource, rename.edits);
    }
  }
  const existing = synchronizedSource ? parseGantt(synchronizedSource).document : undefined;
  const existingDependencies = new Set(
    existing?.dependencies.map((item) => `${item.predecessorTaskId}:${item.successorTaskId}`) ?? [],
  );
  const links = document.nodes.map((node) => ({
    wbsAlias: node.alias!,
    ganttAlias: priorLinks.get(node.alias!) ?? `wbs_${node.alias}`,
  }));
  const byAlias = new Map(links.map((link) => [link.wbsAlias, link.ganttAlias]));
  const children = new Set(document.nodes.flatMap((node) => (node.parentId ? [node.parentId] : [])));
  const existingSuffixes = new Map<string, string>();
  for (const line of synchronizedSource?.split("\n") ?? []) {
    const declaration = line.match(/^\[[^\]\n]+\]\s+as\s+\[([^\]\n]+)\]\s+(.+)$/i);
    if (declaration?.[1] && declaration[2]) existingSuffixes.set(declaration[1], declaration[2]);
  }
  const declarations: string[] = [];
  const dependencyLines: string[] = [];
  const dependencies: Array<{ from: string; to: string }> = [];
  const warnings: string[] = [];
  for (const node of document.nodes) {
    const alias = byAlias.get(node.alias!)!;
    if (children.has(node.id)) {
      declarations.push(`' WBS summary: ${alias}`);
      declarations.push(`-- Summary: ${hierarchyLabel(node)} --`);
    }
    declarations.push(`[${hierarchyLabel(node)}] as [${alias}] ${existingSuffixes.get(alias) ?? "requires 5 days"}`);
  }
  const edges = new Map<string, Set<string>>();
  for (const relationship of document.relationships) {
    const from = byAlias.get(relationship.from);
    const to = byAlias.get(relationship.to);
    if (!from || !to) {
      warnings.push(`Dependency ${relationship.from} → ${relationship.to} could not be mapped.`);
      continue;
    }
    if (cyclic(from, to, edges)) {
      warnings.push(`Dependency ${relationship.from} → ${relationship.to} would create a cycle.`);
      continue;
    }
    edges.set(from, new Set([...(edges.get(from) ?? []), to]));
    dependencies.push({ from: relationship.from, to: relationship.to });
    if (!existingDependencies.has(`${from.toLowerCase()}:${to.toLowerCase()}`))
      dependencyLines.push(`[${to}] starts at [${from}]'s end`);
  }
  let ganttSource: string;
  if (!synchronizedSource) {
    ganttSource = `@startgantt\n${[...declarations, ...dependencyLines].join("\n")}\n@endgantt`;
  } else {
    const autoAliases = new Set(links.map((link) => link.ganttAlias));
    const retained: string[] = [];
    let insertionIndex: number | undefined;
    const sourceLines = synchronizedSource.split("\n");
    for (let index = 0; index < sourceLines.length; index += 1) {
      const line = sourceLines[index]!;
      if (/^' WBS summary: /.test(line)) {
        if (/^-- .* --$/.test(sourceLines[index + 1] ?? "")) index += 1;
        continue;
      }
      const alias = line.match(/^\[[^\]\n]+\]\s+as\s+\[([^\]\n]+)\]\s+.+$/i)?.[1];
      if (alias && autoAliases.has(alias)) {
        insertionIndex ??= retained.length;
        continue;
      }
      retained.push(line);
    }
    const end = retained.findIndex((line) => /^\s*@endgantt\b/i.test(line));
    retained.splice(insertionIndex ?? Math.max(0, end), 0, ...declarations);
    const dependencyEnd = retained.findIndex((line) => /^\s*@endgantt\b/i.test(line));
    if (dependencyLines.length && dependencyEnd >= 0) retained.splice(dependencyEnd, 0, ...dependencyLines);
    ganttSource = retained.join("\n");
  }
  const currentDependencies = new Set(dependencies.map((item) => `${item.from}:${item.to}`));
  for (const previous of importedDependencies) {
    if (currentDependencies.has(`${previous.from}:${previous.to}`)) continue;
    const priorFrom = priorLinks.get(previous.from) ?? `wbs_${previous.from}`;
    const priorTo = priorLinks.get(previous.to) ?? `wbs_${previous.to}`;
    const stale = parseGantt(ganttSource).document.dependencies.find(
      (item) => item.predecessorTaskId === priorFrom.toLowerCase() && item.successorTaskId === priorTo.toLowerCase(),
    );
    if (stale)
      ganttSource = applySourceEdits(ganttSource, removeDependency(ganttSource, stale.sourceRange, stale.notes).edits);
  }
  return { wbsSource, ganttSource, links, dependencies, warnings };
}

export function linkedWbsNode(nodes: readonly WbsNode[], alias: string): WbsNode | undefined {
  return nodes.find((node) => node.alias === alias);
}

/** Summary dates are derived from scheduled descendants; leaf dates stay owned by Gantt. */
export function rollupWbsGroupDates(
  wbsSource: string,
  links: readonly WbsGanttLink[],
  dates: ReadonlyMap<string, ResolvedTaskDates>,
): Map<string, ResolvedTaskDates> {
  const result = new Map(dates);
  const nodes = parseWbs(wbsSource).nodes;
  const linkByAlias = new Map(links.map((link) => [link.wbsAlias, link.ganttAlias.toLowerCase()]));
  for (const node of [...nodes].reverse()) {
    const descendants = nodes.filter((item) => {
      let parent = item.parentId;
      while (parent) {
        if (parent === node.id) return true;
        parent = nodes.find((candidate) => candidate.id === parent)?.parentId;
      }
      return false;
    });
    if (!descendants.length || !node.alias) continue;
    const alias = linkByAlias.get(node.alias);
    if (!alias) continue;
    const scheduled = descendants
      .flatMap((item) => (item.alias ? [result.get(linkByAlias.get(item.alias) ?? "")] : []))
      .filter((item): item is ResolvedTaskDates => Boolean(item?.start && item.end));
    if (!scheduled.length) continue;
    result.set(alias, {
      start: scheduled.map((item) => item.start!).sort()[0]!,
      end: scheduled
        .map((item) => item.end!)
        .sort()
        .at(-1)!,
      derived: true,
    });
  }
  return result;
}

/** Reflect derived group spans in the PlantUML bars after children are scheduled. */
export function applyWbsGroupRollups(
  ganttSource: string,
  wbsSource: string,
  links: readonly WbsGanttLink[],
  dates: ReadonlyMap<string, ResolvedTaskDates>,
): string {
  const nodes = parseWbs(wbsSource).nodes;
  const groups = new Set(nodes.flatMap((node) => (node.parentId ? [node.parentId] : [])));
  const byAlias = new Map(links.map((link) => [link.wbsAlias, link.ganttAlias.toLowerCase()]));
  const groupTasks = new Map(
    nodes
      .filter((node) => groups.has(node.id) && node.alias)
      .map((node) => [byAlias.get(node.alias!) ?? "", dates.get(byAlias.get(node.alias!) ?? "")] as const),
  );
  return ganttSource
    .split("\n")
    .map((line) => {
      const declaration = line.match(/^(\[[^\]\n]+\]\s+as\s+\[([^\]\n]+)\])\s+.+$/i);
      if (!declaration?.[1] || !declaration[2]) return line;
      const span = groupTasks.get(declaration[2].toLowerCase());
      if (!span?.start || !span.end) return line;
      return `${declaration[1]} starts ${span.start} and ends ${span.end}`;
    })
    .join("\n");
}
