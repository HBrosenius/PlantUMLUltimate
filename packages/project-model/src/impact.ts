import type { ImpactPath, ImpactResult, ProjectLink } from "./types";

export function reverseImpact(
  links: readonly ProjectLink[],
  targetId: string,
  requestedDepth = 2,
  maxNodes = 200,
): ImpactResult {
  const depth = Math.min(5, Math.max(0, requestedDepth));
  const incoming = new Map<string, ProjectLink[]>();
  for (const link of links) incoming.set(link.to, [...(incoming.get(link.to) ?? []), link]);
  const paths: ImpactPath[] = [];
  const queue: Array<{ elements: string[]; linkIds: string[] }> = [{ elements: [targetId], linkIds: [] }];
  let truncated = false;
  while (queue.length) {
    const path = queue.shift()!;
    if (path.linkIds.length === depth) continue;
    for (const link of incoming.get(path.elements[0]!) ?? []) {
      if (path.elements.includes(link.from)) continue;
      const next = { elements: [link.from, ...path.elements], linkIds: [link.id, ...path.linkIds] };
      if (paths.length >= maxNodes) {
        truncated = true;
        break;
      }
      paths.push({ elementIds: next.elements, linkIds: next.linkIds });
      queue.push(next);
    }
    if (truncated) break;
  }
  return { paths, truncated, depth };
}
