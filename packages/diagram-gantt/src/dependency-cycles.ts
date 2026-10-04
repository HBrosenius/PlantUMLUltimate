import type { Diagnostic, GanttDependency, GanttTask } from "./model";

/** Report every relationship inside a cyclic component, with a concrete cycle through that edge. */
export function dependencyCycleDiagnostics(
  tasks: ReadonlyMap<string, GanttTask>,
  dependencies: readonly GanttDependency[],
): Diagnostic[] {
  const outgoing = new Map<string, GanttDependency[]>();
  for (const dependency of dependencies) {
    if (!tasks.has(dependency.predecessorTaskId) || !tasks.has(dependency.successorTaskId)) continue;
    const edges = outgoing.get(dependency.predecessorTaskId) ?? [];
    edges.push(dependency);
    outgoing.set(dependency.predecessorTaskId, edges);
  }
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const components = new Map<string, Set<string>>();
  const visit = (id: string) => {
    indices.set(id, indices.size);
    low.set(id, indices.get(id)!);
    stack.push(id);
    active.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      const next = edge.successorTaskId;
      if (!indices.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (active.has(next)) {
        low.set(id, Math.min(low.get(id)!, indices.get(next)!));
      }
    }
    if (low.get(id) !== indices.get(id)) return;
    const component = new Set<string>();
    let member: string;
    do {
      member = stack.pop()!;
      active.delete(member);
      component.add(member);
    } while (member !== id);
    for (const member of component) components.set(member, component);
  };
  for (const id of tasks.keys()) if (!indices.has(id)) visit(id);

  const diagnostics: Diagnostic[] = [];
  for (const dependency of dependencies) {
    const from = dependency.predecessorTaskId;
    const to = dependency.successorTaskId;
    const component = components.get(from);
    if (!component?.has(to) || (component.size === 1 && from !== to)) continue;
    // Find a shortest return path within this component. Downstream tasks are excluded.
    const parents = new Map<string, string | undefined>([[to, undefined]]);
    const queue = [to];
    for (let cursor = 0; cursor < queue.length && !parents.has(from); cursor++) {
      const current = queue[cursor]!;
      for (const edge of outgoing.get(current) ?? []) {
        const next = edge.successorTaskId;
        if (!component.has(next) || parents.has(next)) continue;
        parents.set(next, current);
        queue.push(next);
      }
    }
    const path = [from];
    let current = from;
    while (current !== to) {
      current = parents.get(current)!;
      path.push(current);
    }
    path.reverse();
    const chain = [from, ...path].map((id) => tasks.get(id)!.label).join(" → ");
    diagnostics.push({
      severity: "warning",
      code: "dependency-cycle",
      message: `Dependency cycle: ${chain}. Cascading schedule changes are unavailable for this loop. Review the relationships in this chain.`,
      range: dependency.sourceRange,
    });
  }
  return diagnostics;
}
