import { insertWbsNode, parseWbs, type WbsNode } from "@plantuml-studio/diagram-wbs";
import {
  applySourceEdits,
  deleteTask,
  parseGantt,
  removeDependency,
  renameTask,
  taskOccurrences,
} from "@plantuml-studio/diagram-gantt";

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

/** Add a chosen project start to a newly generated Gantt chart. */
export function setGeneratedGanttProjectStart(source: string, startDate: string): string {
  return source.replace(/^@startgantt\n/, `@startgantt\nProject starts ${startDate}\n`);
}

export interface GanttWbsImport {
  wbsSource: string;
  ganttSource: string;
  links: WbsGanttLink[];
  dependencies: Array<{ from: string; to: string }>;
  addedCount: number;
  warnings: string[];
}

/** Place unlinked Gantt tasks beneath a single linked predecessor, or beneath the WBS root. */
export function addMissingGanttTasksToWbs(
  wbsSource: string,
  ganttSource: string,
  existingLinks: readonly WbsGanttLink[],
  importedDependencies: readonly { from: string; to: string }[] = [],
  selectedTaskIds?: readonly string[],
): GanttWbsImport {
  let nextWbs = ensureWbsAliases(wbsSource);
  let nextGantt = ganttSource;
  let links = [...existingLinks];
  const warnings: string[] = [];
  let addedCount = 0;
  const gantt = parseGantt(ganttSource).document;
  const tasks = gantt.tasks;
  for (const [index, original] of tasks.entries()) {
    if (selectedTaskIds && !selectedTaskIds.includes(original.id)) continue;
    const currentAliases = new Set(parseWbs(nextWbs).nodes.flatMap((node) => (node.alias ? [node.alias] : [])));
    if (links.some((link) => link.ganttAlias.toLowerCase() === original.id && currentAliases.has(link.wbsAlias)))
      continue;
    const current = parseGantt(nextGantt).document.tasks[index];
    if (!current) continue;
    const document = parseWbs(nextWbs);
    const predecessors = gantt.dependencies.filter((dependency) => dependency.successorTaskId === original.id);
    const predecessor =
      predecessors.length === 1 && predecessors[0]?.relation === "start-after-end"
        ? predecessors[0].predecessorTaskId
        : undefined;
    const parentLink = links.find((link) => link.ganttAlias.toLowerCase() === predecessor);
    const parent = document.nodes.find((node) => node.alias === parentLink?.wbsAlias) ?? document.roots[0];
    const label = original.label.replace(/^(?:↳\s*)+/, "").trim();
    if (!label) {
      warnings.push(`Skipped an unnamed Gantt task (${original.id}).`);
      continue;
    }
    const usedAliases = new Set(document.nodes.flatMap((node) => (node.alias ? [node.alias] : [])));
    nextWbs = ensureWbsAliases(
      insertWbsNode(nextWbs, document, { label, ...(original.color ? { color: original.color.value } : {}) }, parent),
    );
    const node = parseWbs(nextWbs).nodes.find((item) => item.alias && !usedAliases.has(item.alias));
    if (!node?.alias) throw new Error(`Could not identify imported WBS node for ${label}`);
    const linked = relinkWbsGanttTask(nextGantt, links, node.alias, current.id);
    if (linked.error) throw new Error(linked.error);
    nextGantt = linked.ganttSource;
    links = linked.links;
    addedCount += 1;
  }
  return {
    wbsSource: nextWbs,
    ganttSource: nextGantt,
    links,
    dependencies: [...importedDependencies],
    addedCount,
    warnings,
  };
}

export type RemovedWbsTaskPolicy = "keep-scheduled" | "keep" | "delete";

export function relinkWbsGanttTask(
  ganttSource: string,
  existingLinks: readonly WbsGanttLink[],
  wbsAlias: string,
  targetTaskId: string,
  oldTaskPolicy: "keep" | "delete" = "keep",
): { ganttSource: string; links: WbsGanttLink[]; error?: string } {
  const parsed = parseGantt(ganttSource).document;
  const target = parsed.symbols.tasks.get(targetTaskId);
  if (!target) return { ganttSource, links: [...existingLinks], error: "Gantt task was not found" };
  if (existingLinks.some((link) => link.ganttAlias.toLowerCase() === target.id && link.wbsAlias !== wbsAlias))
    return { ganttSource, links: [...existingLinks], error: "That Gantt task is already linked to another WBS node" };
  let nextSource = ganttSource;
  let ganttAlias = target.alias?.value;
  if (!ganttAlias) {
    const base = `wbs_link_${safeAlias(wbsAlias)}`;
    ganttAlias = base;
    for (let index = 2; parsed.symbols.tasks.has(ganttAlias.toLowerCase()); index += 1) ganttAlias = `${base}_${index}`;
    const at = target.labelRange.to + 1;
    nextSource = `${nextSource.slice(0, at)} as [${ganttAlias}]${nextSource.slice(at)}`;
  }
  const oldLink = existingLinks.find((link) => link.wbsAlias === wbsAlias);
  if (oldLink && oldLink.ganttAlias.toLowerCase() !== ganttAlias.toLowerCase() && oldTaskPolicy === "delete") {
    const updated = parseGantt(nextSource).document;
    const oldTask = updated.symbols.tasks.get(oldLink.ganttAlias.toLowerCase());
    if (oldTask) {
      const removal = deleteTask(nextSource, updated, oldTask);
      if (removal.unavailableReason)
        return { ganttSource, links: [...existingLinks], error: removal.unavailableReason };
      nextSource = applySourceEdits(nextSource, removal.edits);
    }
  }
  return {
    ganttSource: nextSource,
    links: [
      ...existingLinks.filter(
        (link) => link.wbsAlias !== wbsAlias && link.ganttAlias.toLowerCase() !== ganttAlias.toLowerCase(),
      ),
      { wbsAlias, ganttAlias },
    ],
  };
}

const safeAlias = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[^A-Za-z_]/, "_$&");
const safeLabel = (value: string) => value.replaceAll("]", ")").replaceAll("\n", " ").trim();
const hierarchyLabel = (node: WbsNode) => safeLabel(node.label);

/** PlantUML needs a project start before it can render earlier undated tasks beside a dated leaf. */
export function ensureLinkedGanttProjectStart(source: string): string {
  const document = parseGantt(source).document;
  if (document.projectStart) return source;
  const firstDate = document.tasks
    .flatMap((task) => {
      const start = task.start?.value;
      return start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? [start] : [];
    })
    .sort()[0];
  if (!firstDate) return source;
  return source.replace(/(^\s*@startgantt[^\n]*\n)/im, `$1Project starts ${firstDate}\n`);
}

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
  removedTaskPolicy: RemovedWbsTaskPolicy = "keep-scheduled",
  includeUnlinkedNodes = true,
  selectedNodeIds?: readonly string[],
): WbsGanttConversion {
  const wbsSource = ensureWbsAliases(source);
  const document = parseWbs(wbsSource);
  const priorLinks = new Map(existingLinks.map((link) => [link.wbsAlias, link.ganttAlias]));
  const managedDependencies = new Set(
    importedDependencies.map(
      ({ from, to }) =>
        `${(priorLinks.get(from) ?? `wbs_${from}`).toLowerCase()}:${(priorLinks.get(to) ?? `wbs_${to}`).toLowerCase()}`,
    ),
  );
  const selected = new Set(selectedNodeIds);
  for (const node of document.nodes) {
    if (!selected.has(node.id)) continue;
    let parentId = node.parentId;
    while (parentId) {
      selected.add(parentId);
      parentId = document.nodes.find((candidate) => candidate.id === parentId)?.parentId;
    }
  }
  const importedNodes = document.nodes.filter(
    (node) =>
      (!existingGanttSource || includeUnlinkedNodes || priorLinks.has(node.alias!)) &&
      (!selectedNodeIds || priorLinks.has(node.alias!) || selected.has(node.id)),
  );
  let synchronizedSource = existingGanttSource;
  const warnings: string[] = [];
  if (synchronizedSource) {
    const currentAliases = new Set(document.nodes.map((node) => node.alias));
    for (const link of existingLinks) {
      if (currentAliases.has(link.wbsAlias)) continue;
      if (removedTaskPolicy === "keep") {
        warnings.push(`Kept Gantt task ${link.ganttAlias} after its WBS node was removed; it is now unlinked.`);
        continue;
      }
      if (removedTaskPolicy === "keep-scheduled" && link.ganttAlias !== `wbs_${link.wbsAlias}`) continue;
      const parsed = parseGantt(synchronizedSource).document;
      const task = parsed.symbols.tasks.get(link.ganttAlias.toLowerCase());
      if (!task) continue;
      const hasSchedule =
        Boolean(
          task.start ||
          task.end ||
          task.resources?.length ||
          task.notes?.length ||
          task.links?.length ||
          task.pauses?.length ||
          task.completion ||
          task.color,
        ) ||
        (task.duration !== undefined && (task.duration.value !== 5 || task.duration.unit !== "day")) ||
        parsed.dependencies.some(
          (dependency) =>
            (dependency.predecessorTaskId === task.id || dependency.successorTaskId === task.id) &&
            !managedDependencies.has(`${dependency.predecessorTaskId}:${dependency.successorTaskId}`),
        );
      if (removedTaskPolicy === "keep-scheduled" && hasSchedule) {
        warnings.push(`Kept scheduled Gantt task ${task.label} after its WBS node was removed; it is now unlinked.`);
        continue;
      }
      const removal = deleteTask(synchronizedSource, parsed, task);
      if (!removal.unavailableReason) synchronizedSource = applySourceEdits(synchronizedSource, removal.edits);
    }
    for (const node of importedNodes) {
      const parsed = parseGantt(synchronizedSource).document;
      const task = parsed.symbols.tasks.get((priorLinks.get(node.alias!) ?? `wbs_${node.alias}`).toLowerCase());
      const label = hierarchyLabel(node);
      if (!task || task.label === label) continue;
      if (task.alias) {
        const references = taskOccurrences(synchronizedSource, parsed, task)
          .filter((item) => item.role === "reference" && item.value === task.label)
          .map((item) => ({ range: item.range, text: task.alias!.value }));
        synchronizedSource = applySourceEdits(synchronizedSource, references);
      } else {
        const rename = renameTask(synchronizedSource, parsed, task, label);
        if (!rename.unavailableReason) synchronizedSource = applySourceEdits(synchronizedSource, rename.edits);
      }
    }
  }
  const existing = synchronizedSource ? parseGantt(synchronizedSource).document : undefined;
  const existingDependencies = new Set(
    existing?.dependencies.map((item) => `${item.predecessorTaskId}:${item.successorTaskId}`) ?? [],
  );
  const links = importedNodes.map((node) => ({
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
  for (const node of importedNodes) {
    const alias = byAlias.get(node.alias!)!;
    if (children.has(node.id)) {
      declarations.push(`' WBS summary: ${alias}`);
      declarations.push(`-- Summary: ${hierarchyLabel(node)} --`);
    }
    declarations.push(`[${hierarchyLabel(node)}] as [${alias}] ${existingSuffixes.get(alias) ?? "requires 5 days"}`);
  }
  const edges = new Map<string, Set<string>>();
  const addDependency = (fromAlias: string, toAlias: string, reason: string) => {
    const from = byAlias.get(fromAlias);
    const to = byAlias.get(toAlias);
    if (!from || !to) {
      warnings.push(`${reason} ${fromAlias} → ${toAlias} could not be mapped.`);
      return;
    }
    if (edges.get(from)?.has(to)) return;
    if (cyclic(from, to, edges)) {
      warnings.push(`${reason} ${fromAlias} → ${toAlias} would create a cycle.`);
      return;
    }
    edges.set(from, new Set([...(edges.get(from) ?? []), to]));
    dependencies.push({ from: fromAlias, to: toAlias });
    if (!existingDependencies.has(`${from.toLowerCase()}:${to.toLowerCase()}`))
      dependencyLines.push(`[${to}] starts at [${from}]'s end`);
  };
  for (const node of importedNodes) {
    const parent = document.nodes.find((candidate) => candidate.id === node.parentId);
    if (parent?.alias && node.alias) addDependency(parent.alias, node.alias, "Hierarchy dependency");
  }
  for (const relationship of document.relationships) {
    addDependency(relationship.from, relationship.to, "Dependency");
  }
  let ganttSource: string;
  if (!synchronizedSource) {
    ganttSource = `@startgantt\nsaturday are closed\nsunday are closed\n${[...declarations, ...dependencyLines].join("\n")}\n@endgantt`;
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
