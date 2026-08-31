import { diffVersionSources } from "./version-diff";

interface ChangeHunk {
  start: number;
  end: number;
  lines: string[];
}

export interface MergeConflict {
  base: string[];
  local: string[];
  external: string[];
}

export type MergeSegment =
  { kind: "text"; lines: string[] } | { kind: "conflict"; conflictIndex: number; conflict: MergeConflict };

export interface ThreeWayMerge {
  segments: MergeSegment[];
  conflicts: MergeConflict[];
}

function changesFrom(baseSource: string, changedSource: string): ChangeHunk[] {
  const changes: ChangeHunk[] = [];
  let baseIndex = 0;
  let current: ChangeHunk | undefined;
  const flush = () => {
    if (current) changes.push(current);
    current = undefined;
  };
  for (const line of diffVersionSources(baseSource, changedSource)) {
    if (line.kind === "equal") {
      flush();
      baseIndex += 1;
    } else if (line.kind === "removed") {
      current ??= { start: baseIndex, end: baseIndex, lines: [] };
      current.end += 1;
      baseIndex += 1;
    } else {
      current ??= { start: baseIndex, end: baseIndex, lines: [] };
      current.lines.push(line.right ?? "");
    }
  }
  flush();
  return changes;
}

function sameChange(left: ChangeHunk, right: ChangeHunk): boolean {
  return left.start === right.start && left.end === right.end && left.lines.join("\n") === right.lines.join("\n");
}

function overlaps(left: ChangeHunk, right: ChangeHunk): boolean {
  if (left.start === left.end && right.start === right.end) return left.start === right.start;
  if (left.start === left.end) return left.start >= right.start && left.start <= right.end;
  if (right.start === right.end) return right.start >= left.start && right.start <= left.end;
  return left.start < right.end && right.start < left.end;
}

function applyRange(base: readonly string[], start: number, end: number, hunks: readonly ChangeHunk[]): string[] {
  const result: string[] = [];
  let cursor = start;
  for (const hunk of [...hunks].sort((left, right) => left.start - right.start || left.end - right.end)) {
    result.push(...base.slice(cursor, hunk.start), ...hunk.lines);
    cursor = hunk.end;
  }
  result.push(...base.slice(cursor, end));
  return result;
}

export function threeWayMerge(baseSource: string, localSource: string, externalSource: string): ThreeWayMerge {
  const base = baseSource.split("\n");
  const local = changesFrom(baseSource, localSource);
  const external = changesFrom(baseSource, externalSource);
  const consumedLocal = new Set<number>();
  const consumedExternal = new Set<number>();
  const operations: Array<
    | { kind: "change"; hunk: ChangeHunk }
    | { kind: "conflict"; start: number; end: number; local: ChangeHunk[]; external: ChangeHunk[] }
  > = [];

  for (let localIndex = 0; localIndex < local.length; localIndex += 1) {
    for (let externalIndex = 0; externalIndex < external.length; externalIndex += 1) {
      if (sameChange(local[localIndex]!, external[externalIndex]!)) {
        consumedLocal.add(localIndex);
        consumedExternal.add(externalIndex);
        operations.push({ kind: "change", hunk: local[localIndex]! });
      }
    }
  }

  for (let localIndex = 0; localIndex < local.length; localIndex += 1) {
    if (consumedLocal.has(localIndex)) continue;
    const localGroup = new Set([localIndex]);
    const externalGroup = new Set<number>();
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let externalIndex = 0; externalIndex < external.length; externalIndex += 1) {
        if (consumedExternal.has(externalIndex) || externalGroup.has(externalIndex)) continue;
        if ([...localGroup].some((index) => overlaps(local[index]!, external[externalIndex]!))) {
          externalGroup.add(externalIndex);
          expanded = true;
        }
      }
      for (let nextLocal = 0; nextLocal < local.length; nextLocal += 1) {
        if (consumedLocal.has(nextLocal) || localGroup.has(nextLocal)) continue;
        if ([...externalGroup].some((index) => overlaps(local[nextLocal]!, external[index]!))) {
          localGroup.add(nextLocal);
          expanded = true;
        }
      }
    }
    if (!externalGroup.size) continue;
    for (const index of localGroup) consumedLocal.add(index);
    for (const index of externalGroup) consumedExternal.add(index);
    const localHunks = [...localGroup].map((index) => local[index]!);
    const externalHunks = [...externalGroup].map((index) => external[index]!);
    operations.push({
      kind: "conflict",
      start: Math.min(...localHunks.map((item) => item.start), ...externalHunks.map((item) => item.start)),
      end: Math.max(...localHunks.map((item) => item.end), ...externalHunks.map((item) => item.end)),
      local: localHunks,
      external: externalHunks,
    });
  }

  local.forEach((hunk, index) => {
    if (!consumedLocal.has(index)) operations.push({ kind: "change", hunk });
  });
  external.forEach((hunk, index) => {
    if (!consumedExternal.has(index)) operations.push({ kind: "change", hunk });
  });
  operations.sort((left, right) => {
    const leftStart = left.kind === "change" ? left.hunk.start : left.start;
    const rightStart = right.kind === "change" ? right.hunk.start : right.start;
    return leftStart - rightStart;
  });

  const segments: MergeSegment[] = [];
  const conflicts: MergeConflict[] = [];
  let cursor = 0;
  const addText = (lines: string[]) => {
    if (!lines.length) return;
    const previous = segments.at(-1);
    if (previous?.kind === "text") previous.lines.push(...lines);
    else segments.push({ kind: "text", lines: [...lines] });
  };
  for (const operation of operations) {
    const start = operation.kind === "change" ? operation.hunk.start : operation.start;
    const end = operation.kind === "change" ? operation.hunk.end : operation.end;
    addText(base.slice(cursor, start));
    if (operation.kind === "change") addText(operation.hunk.lines);
    else {
      const conflict: MergeConflict = {
        base: base.slice(start, end),
        local: applyRange(base, start, end, operation.local),
        external: applyRange(base, start, end, operation.external),
      };
      const conflictIndex = conflicts.push(conflict) - 1;
      segments.push({ kind: "conflict", conflictIndex, conflict });
    }
    cursor = end;
  }
  addText(base.slice(cursor));
  return { segments, conflicts };
}

export function resolveThreeWayMerge(merge: ThreeWayMerge, choices: readonly ("local" | "external")[]): string {
  return merge.segments
    .flatMap((segment) =>
      segment.kind === "text"
        ? segment.lines
        : choices[segment.conflictIndex] === "external"
          ? segment.conflict.external
          : segment.conflict.local,
    )
    .join("\n");
}
