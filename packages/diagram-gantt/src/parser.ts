import type {
  DateExpression,
  Diagnostic,
  GanttDependency,
  GanttDocument,
  GanttDivider,
  GanttNote,
  GanttTask,
  ParseResult,
  SourceValue,
  TaskDeclaration,
  TaskReference,
  TextRange,
  UnknownSyntaxNode,
} from "./model";

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

interface SourceLine {
  text: string;
  from: number;
  to: number;
}

function linesOf(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let from = 0;
  for (const text of source.split(/\n/)) {
    const normalized = text.endsWith("\r") ? text.slice(0, -1) : text;
    lines.push({ text: normalized, from, to: from + normalized.length });
    from += text.length + 1;
  }
  return lines;
}

function range(line: SourceLine, start: number, text: string): TextRange {
  return { from: line.from + start, to: line.from + start + text.length };
}

export function normalizeTaskId(label: string): string {
  return label.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function dateExpression(value: string, valueRange: TextRange): DateExpression {
  return { value, range: valueRange, resolved: ISO_DATE.test(value) };
}

function recognizedDate(value: string): boolean {
  return (
    ISO_DATE.test(value) ||
    /^\d{4}\/\d{2}\/\d{2}$/.test(value) ||
    /^D[+-]\d+$/i.test(value) ||
    /^today(?:[+-]\d+)?$/i.test(value) ||
    /^(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.test(value) ||
    /^the\s+.+$/i.test(value) ||
    /^\$[A-Za-z_]\w*$/.test(value) ||
    /^%date\(.+\)$/i.test(value)
  );
}

function taskReference(value: string, valueRange: TextRange): TaskReference {
  return { value, range: valueRange };
}

function getOrCreateTask(
  tasks: Map<string, GanttTask>,
  references: Map<string, string>,
  label: string,
  labelRange: TextRange,
  lineRange: TextRange,
  alias?: SourceValue<string>,
): GanttTask {
  const labelKey = normalizeTaskId(label);
  const id = alias ? normalizeTaskId(alias.value) : (references.get(labelKey) ?? labelKey);
  const existing = tasks.get(id);
  if (existing) {
    existing.sourceRange = {
      from: Math.min(existing.sourceRange.from, lineRange.from),
      to: Math.max(existing.sourceRange.to, lineRange.to),
    };
    references.set(labelKey, existing.id);
    return existing;
  }
  const task: GanttTask = {
    id,
    label,
    labelRange,
    sourceRange: lineRange,
    declarations: [],
    resources: [],
    ...(alias ? { alias } : {}),
  };
  tasks.set(id, task);
  references.set(labelKey, id);
  references.set(id, id);
  return task;
}

function declaration(task: GanttTask, kind: TaskDeclaration["kind"], lineRange: TextRange): void {
  task.declarations.push({ kind, range: lineRange });
}

function inlineDeclaration(task: GanttTask, kind: TaskDeclaration["kind"], clauseRange: TextRange): void {
  task.declarations.push({ kind, range: clauseRange, inline: true });
}

export function parseGantt(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const taskMap = new Map<string, GanttTask>();
  const taskReferences = new Map<string, string>();
  const dependencies: GanttDependency[] = [];
  const unknown: UnknownSyntaxNode[] = [];
  const dividers: GanttDivider[] = [];
  const verticalSeparators: import("./model").GanttVerticalSeparator[] = [];
  const noteBlocks: GanttNote[] = [];
  const skippedNoteLines = new Set<number>();
  const sourceLines = linesOf(source);
  const skippedLegendLines = new Set<number>();
  for (let index = 0; index < sourceLines.length; index += 1) {
    if (!/^\s*legend\s*$/i.test(sourceLines[index]!.text)) continue;
    let end = index + 1;
    while (end < sourceLines.length && !/^\s*endlegend\s*$/i.test(sourceLines[end]!.text)) end += 1;
    if (end >= sourceLines.length) continue;
    for (let cursor = index; cursor <= end; cursor += 1) skippedLegendLines.add(sourceLines[cursor]!.from);
    index = end;
  }
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index]!;
    const inlineNote = line.text.match(/^\s*note\s+(bottom|top|left|right)\s*:\s*(.+?)\s*$/i);
    if (inlineNote?.[1] && inlineNote[2]) {
      skippedNoteLines.add(line.from);
      noteBlocks.push({
        text: inlineNote[2],
        position: inlineNote[1].toLowerCase() as GanttNote["position"],
        sourceRange: { from: line.from, to: line.to },
      });
      continue;
    }
    const noteMatch = line.text.match(/^\s*note\s+(bottom|top|left|right)\s*$/i);
    if (!noteMatch?.[1]) continue;
    let end = index + 1;
    while (end < sourceLines.length && !/^\s*end\s+note\s*$/i.test(sourceLines[end]!.text)) end += 1;
    if (end >= sourceLines.length) {
      diagnostics.push({
        severity: "error",
        message: "Note is missing end note",
        range: { from: line.from, to: line.to },
        code: "unterminated-note",
      });
      continue;
    }
    for (let cursor = index; cursor <= end; cursor += 1) skippedNoteLines.add(sourceLines[cursor]!.from);
    noteBlocks.push({
      text: sourceLines
        .slice(index + 1, end)
        .map((item) => item.text)
        .join("\n"),
      position: noteMatch[1].toLowerCase() as GanttNote["position"],
      sourceRange: { from: line.from, to: sourceLines[end]!.to },
    });
    index = end;
  }
  let projectStart: DateExpression | undefined;
  let hasStart = false;
  let hasEnd = false;
  let previousTaskId: string | undefined;

  for (const line of sourceLines) {
    if (skippedNoteLines.has(line.from) || skippedLegendLines.has(line.from)) continue;
    const lineRange = { from: line.from, to: line.to };
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.startsWith("'")) continue;
    if (/^@startgantt\b/i.test(trimmed)) {
      hasStart = true;
      continue;
    }
    if (/^@endgantt\b/i.test(trimmed)) {
      hasEnd = true;
      continue;
    }

    const dividerMatch = line.text.match(/^\s*--\s*(.*?)\s*--\s*$/);
    if (dividerMatch?.[1] !== undefined) {
      dividers.push({ label: dividerMatch[1], sourceRange: lineRange });
      continue;
    }

    const verticalSeparatorMatch = line.text.match(
      /^\s*Separator\s+just\s+(?:(\d+)\s+days?\s+(after|before)\s+|at\s+)\[([^\]]+)]'s\s+(start|end)\s*$/i,
    );
    if (verticalSeparatorMatch?.[3] && verticalSeparatorMatch[4]) {
      verticalSeparators.push({
        taskLabel: verticalSeparatorMatch[3],
        anchor: verticalSeparatorMatch[4].toLowerCase() as "start" | "end",
        offset: Number(verticalSeparatorMatch[1] ?? 0),
        direction: (verticalSeparatorMatch[2]?.toLowerCase() as "after" | "before" | undefined) ?? "after",
        sourceRange: lineRange,
      });
      continue;
    }

    const projectMatch = line.text.match(/^\s*Project\s+starts\s+(.+?)\s*$/i);
    if (projectMatch?.[1]) {
      const value = projectMatch[1];
      const valueRange = range(line, line.text.indexOf(value), value);
      projectStart = dateExpression(value, valueRange);
      if (!recognizedDate(value))
        diagnostics.push({
          severity: "error",
          message: `Invalid project start date: ${value}`,
          range: valueRange,
          code: "invalid-date",
        });
      continue;
    }

    if (
      /^\s*(?:title\s+.+|header\s+.+|footer\s+.+|caption\s+.+|(?:printscale|ganttscale|projectscale)\s+(?:daily|weekly|monthly|quarterly|yearly)(?:\s+zoom\s+\d+)?|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:is|are)\s+(?:closed|opened)|\d{4}[-/]\d{2}[-/]\d{2}(?:\s+to\s+\d{4}[-/]\d{2}[-/]\d{2})?\s+(?:(?:is|are)\s+(?:closed|opened)|(?:is|are)\s+colou?red\s+in\s+\S+)|today\s+is\s+colou?red\s+in\s+\S+|hide\s+(?:footbox|resources\s+names|resources\s+footbox))\s*$/i.test(
        line.text,
      )
    )
      continue;

    const taskMatch = line.text.match(/^(\s*)(?:(then)\s+)?\[([^\]]+)]\s*(.*)$/i);
    if (taskMatch?.[3] !== undefined && taskMatch[4] !== undefined) {
      const chained = Boolean(taskMatch[2]);
      const label = taskMatch[3];
      const statement = taskMatch[4].trim();
      const labelStart = (taskMatch[1]?.length ?? 0) + (chained ? taskMatch[2]!.length + 2 : 1);
      const labelRange = range(line, labelStart, label);
      const aliasMatch = statement.match(/^as\s+\[([^\]]+)]\s*/i);
      const aliasValue = aliasMatch?.[1];
      const aliasStart = aliasValue ? line.text.indexOf(aliasValue, labelRange.to - line.from) : -1;
      const alias = aliasValue ? { value: aliasValue, range: range(line, aliasStart, aliasValue) } : undefined;
      const task = getOrCreateTask(taskMap, taskReferences, label, labelRange, lineRange, alias);
      if (chained) {
        const predecessor = previousTaskId ? taskMap.get(previousTaskId) : undefined;
        if (predecessor && predecessor.id !== task.id) {
          dependencies.push({
            predecessorTaskId: predecessor.id,
            successorTaskId: task.id,
            predecessor: taskReference(predecessor.label, predecessor.labelRange),
            successor: taskReference(label, labelRange),
            relation: "start-after-end",
            sourceRange: lineRange,
          });
        } else if (!predecessor)
          diagnostics.push({
            severity: "error",
            message: "A 'then' task needs a preceding task",
            range: lineRange,
            code: "missing-predecessor",
          });
      }
      previousTaskId = task.id;

      const repeatedTask = statement.match(/^\[([^\]]+)]\s+(.+)$/);
      if (repeatedTask?.[1] && normalizeTaskId(repeatedTask[1]) === normalizeTaskId(label)) {
        declaration(task, "unknown", lineRange);
        diagnostics.push({
          severity: "error",
          message: `Task name is repeated: remove the second [${repeatedTask[1]}]`,
          range: lineRange,
          code: "duplicate-task-prefix",
        });
        continue;
      }

      const resourceSection = statement.match(/\bon\s+((?:\{[^}]+}\s*)+)/i)?.[1] ?? "";
      for (const resourceMatch of resourceSection.matchAll(/\{([^}]+)}/g)) {
        if (!resourceMatch[1] || resourceMatch.index === undefined) continue;
        for (const rawResource of resourceMatch[1].split(",")) {
          const value = rawResource.trim();
          const parsed = value.match(/^(.+?)(?::\s*(\d+)%)?$/);
          const name = parsed?.[1]?.trim();
          if (!name) continue;
          const nameStart = line.text.indexOf(name, labelRange.to - line.from);
          if (!task.resources?.some((item) => item.value.toLocaleLowerCase() === name.toLocaleLowerCase()))
            task.resources?.push({
              value: name,
              range: range(line, nameStart, name),
              ...(parsed?.[2] ? { allocation: Number(parsed[2]) } : {}),
            });
        }
      }

      const simpleStatement = statement.replace(/^as\s+\[[^\]]+]\s*/i, "").replace(/^on\s+(?:\{[^}]+}\s*)+/i, "");
      const duration = simpleStatement.match(/^(?:lasts|requires)\s+(\d+)\s+(days?|weeks?|months?)\s*$/i);
      if (duration?.[1] && duration[2]) {
        const valueStart = line.text.indexOf(duration[1], labelRange.to - line.from);
        const unitText = duration[2].toLowerCase();
        task.duration = {
          value: Number(duration[1]),
          range: range(line, valueStart, duration[1]),
          unit: unitText.startsWith("month") ? "month" : unitText.startsWith("week") ? "week" : "day",
        };
        if (simpleStatement !== statement) {
          const clauseStart = line.text.indexOf(simpleStatement, labelRange.to - line.from);
          inlineDeclaration(task, "duration", range(line, clauseStart, simpleStatement));
        } else declaration(task, "duration", lineRange);
        continue;
      }

      const compoundDuration = simpleStatement.match(/^(?:lasts|requires)\s+(\d+)\s+weeks?\s+and\s+(\d+)\s+days?\s*$/i);
      if (compoundDuration?.[1] && compoundDuration[2]) {
        const weeks = Number(compoundDuration[1]);
        const days = Number(compoundDuration[2]);
        const valueStart = line.text.indexOf(compoundDuration[1], labelRange.to - line.from);
        task.duration = {
          value: weeks * 7 + days,
          range: range(line, valueStart, simpleStatement.slice(simpleStatement.indexOf(compoundDuration[1]))),
          unit: "day",
          sourceParts: { weeks, days },
        };
        declaration(task, "duration", lineRange);
        continue;
      }

      const absolute = simpleStatement.match(
        /^(starts|ends)\s+(\d{4}[-/]\d{2}[-/]\d{2}|D[+-]\d+|today(?:[+-]\d+)?|\$[A-Za-z_]\w*|%date\(.+\)|the\s+.+?)\s*$/i,
      );
      if (absolute?.[1] && absolute[2]) {
        const value = absolute[2];
        const valueStart = line.text.lastIndexOf(value);
        const expression = dateExpression(value, range(line, valueStart, value));
        if (absolute[1].toLowerCase() === "starts") task.start = expression;
        else task.end = expression;
        declaration(task, absolute[1].toLowerCase() === "starts" ? "start" : "end", lineRange);
        if (!recognizedDate(value))
          diagnostics.push({
            severity: "error",
            message: `Invalid date: ${value}`,
            range: expression.range,
            code: "invalid-date",
          });
        continue;
      }

      const dependency = simpleStatement.match(/^(starts|ends)\s+at\s+\[([^\]]+)]'s\s+(start|end)\s*$/i);
      if (dependency?.[1] && dependency[2] && dependency[3]) {
        const predecessorLabel = dependency[2];
        const predecessorStart = line.text.indexOf(predecessorLabel, labelRange.to - line.from);
        const predecessor = taskReference(predecessorLabel, range(line, predecessorStart, predecessorLabel));
        const successor = taskReference(label, labelRange);
        const left = dependency[1].toLowerCase();
        const right = dependency[3].toLowerCase();
        const relation =
          left === "starts" && right === "end"
            ? "start-after-end"
            : left === "starts" && right === "start"
              ? "start-after-start"
              : left === "ends" && right === "end"
                ? "end-after-end"
                : "end-after-start";
        dependencies.push({
          predecessorTaskId: taskReferences.get(normalizeTaskId(predecessorLabel)) ?? normalizeTaskId(predecessorLabel),
          successorTaskId: task.id,
          predecessor,
          successor,
          relation,
          sourceRange: lineRange,
        });
        declaration(task, "start", lineRange);
        continue;
      }

      const completion = simpleStatement.match(/^is\s+(\d+)%\s+completed\s*$/i);
      if (completion?.[1]) {
        const valueStart = line.text.indexOf(completion[1], labelRange.to - line.from);
        task.completion = { value: Number(completion[1]), range: range(line, valueStart, completion[1]) };
        declaration(task, "completion", lineRange);
        if (task.completion.value > 100)
          diagnostics.push({
            severity: "error",
            message: "Completion must be between 0 and 100%",
            range: task.completion.range,
            code: "completion-range",
          });
        continue;
      }

      const color = simpleStatement.match(/^is\s+colou?red\s+in\s+(\S+)\s*$/i);
      if (color?.[1]) {
        const value = color[1];
        const valueStart = line.text.lastIndexOf(value);
        task.color = { value, range: range(line, valueStart, value) };
        declaration(task, "color", lineRange);
        continue;
      }

      const absoluteMilestone = simpleStatement.match(
        /^happens\s+(\d{4}[-/]\d{2}[-/]\d{2}|D[+-]\d+|today(?:[+-]\d+)?|\$[A-Za-z_]\w*|%date\(.+\)|the\s+.+?)\s*$/i,
      );
      if (absoluteMilestone?.[1]) {
        const value = absoluteMilestone[1];
        const valueStart = line.text.lastIndexOf(value);
        const expression = dateExpression(value, range(line, valueStart, value));
        task.milestone = expression;
        declaration(task, "milestone", lineRange);
        if (!recognizedDate(value))
          diagnostics.push({
            severity: "error",
            message: `Invalid milestone date: ${value}`,
            range: expression.range,
            code: "invalid-date",
          });
        continue;
      }

      const relativeMilestone = simpleStatement.match(/^happens\s+at\s+\[([^\]]+)]'s\s+(start|end)\s*$/i);
      if (relativeMilestone?.[1]) {
        const referenceStart = line.text.indexOf(relativeMilestone[1], labelRange.to - line.from);
        task.milestone = taskReference(relativeMilestone[1], range(line, referenceStart, relativeMilestone[1]));
        declaration(task, "milestone", lineRange);
        continue;
      }

      const invalidMilestone = simpleStatement.match(/^happens\s+(.+)$/i);
      if (invalidMilestone?.[1]) {
        const valueStart = line.text.lastIndexOf(invalidMilestone[1]);
        const expression = dateExpression(invalidMilestone[1], range(line, valueStart, invalidMilestone[1]));
        task.milestone = expression;
        declaration(task, "milestone", lineRange);
        diagnostics.push({
          severity: "error",
          message: `Invalid milestone date: ${invalidMilestone[1]}`,
          range: expression.range,
          code: "invalid-date",
        });
        continue;
      }

      const pause = simpleStatement.match(
        /^pauses\s+on\s+(\d{4}[-/]\d{2}[-/]\d{2}|sunday|monday|tuesday|wednesday|thursday|friday|saturday|D[+-]\d+|today(?:[+-]\d+)?|\$[A-Za-z_]\w*|%date\(.+\)|the\s+.+?)\s*$/i,
      );
      if (pause?.[1]) {
        const value = pause[1];
        const valueStart = line.text.lastIndexOf(value);
        const expression = dateExpression(value, range(line, valueStart, value));
        task.pauses = [...(task.pauses ?? []), expression];
        declaration(task, "pause", lineRange);
        if (!recognizedDate(value))
          diagnostics.push({
            severity: "error",
            message: `Invalid pause date: ${value}`,
            range: expression.range,
            code: "invalid-date",
          });
        continue;
      }

      const sameRow = simpleStatement.match(/^displays\s+on\s+same\s+row\s+as\s+\[([^\]]+)]\s*$/i);
      if (sameRow?.[1]) {
        const referenceStart = line.text.lastIndexOf(sameRow[1]);
        task.sameRowAs = taskReference(sameRow[1], range(line, referenceStart, sameRow[1]));
        task.sameRowTaskId = taskReferences.get(normalizeTaskId(sameRow[1])) ?? normalizeTaskId(sameRow[1]);
        declaration(task, "same-row", lineRange);
        continue;
      }

      const arrow = simpleStatement.match(/^-+(?:\[[^\]]*])?-*>\s*\[([^\]]+)]\s*$/i);
      if (arrow?.[1]) {
        const successorLabel = arrow[1];
        const successorStart = line.text.lastIndexOf(successorLabel);
        const successor = taskReference(successorLabel, range(line, successorStart, successorLabel));
        const target = getOrCreateTask(taskMap, taskReferences, successorLabel, successor.range, lineRange);
        dependencies.push({
          predecessorTaskId: task.id,
          successorTaskId: target.id,
          predecessor: taskReference(label, labelRange),
          successor,
          relation: "start-after-end",
          sourceRange: lineRange,
        });
        declaration(task, "modifier", lineRange);
        continue;
      }

      const relativeConstraint = simpleStatement.match(
        /^(starts|ends)\s+(?:(\d+)\s+(days?|weeks?)\s+)?(after|before)\s+\[([^\]]+)]'s\s+(start|end)(?:\s+with\s+\S+\s+\S+\s+link)?\s*$/i,
      );
      if (relativeConstraint?.[1] && relativeConstraint[5] && relativeConstraint[6]) {
        const predecessorLabel = relativeConstraint[5];
        const predecessorStart = line.text.indexOf(predecessorLabel, labelRange.to - line.from);
        const predecessor = taskReference(predecessorLabel, range(line, predecessorStart, predecessorLabel));
        const left = relativeConstraint[1].toLowerCase();
        const right = relativeConstraint[6].toLowerCase();
        const relation =
          left === "starts" && right === "start"
            ? "start-after-start"
            : left === "ends" && right === "end"
              ? "end-after-end"
              : left === "ends" && right === "start"
                ? "end-after-start"
                : "start-after-end";
        const offsetValue = relativeConstraint[2];
        const offsetStart = offsetValue ? line.text.indexOf(offsetValue, labelRange.to - line.from) : -1;
        const styleMatch = simpleStatement.match(/\s+with\s+(\S+)\s+(solid|dotted|dashed|bold)\s+link\s*$/i);
        const colorValue = styleMatch?.[1];
        const lineStyleValue = styleMatch?.[2]?.toLowerCase() as "solid" | "dotted" | "dashed" | "bold" | undefined;
        dependencies.push({
          predecessorTaskId: taskReferences.get(normalizeTaskId(predecessorLabel)) ?? normalizeTaskId(predecessorLabel),
          successorTaskId: task.id,
          predecessor,
          successor: taskReference(label, labelRange),
          relation,
          sourceRange: lineRange,
          ...(offsetValue
            ? { offset: { value: Number(offsetValue), range: range(line, offsetStart, offsetValue) } }
            : {}),
          direction: relativeConstraint[4]?.toLowerCase() === "before" ? "before" : "after",
          ...(colorValue
            ? { color: { value: colorValue, range: range(line, line.text.lastIndexOf(colorValue), colorValue) } }
            : {}),
          ...(lineStyleValue
            ? {
                lineStyle: {
                  value: lineStyleValue,
                  range: range(line, line.text.lastIndexOf(styleMatch![2]!), styleMatch![2]!),
                },
              }
            : {}),
        });
        declaration(task, left === "starts" ? "start" : "end", lineRange);
        continue;
      }

      const compoundClauses = simpleStatement.split(
        /\s+and\s+(?=(?:(?:starts|ends|requires|lasts)\b|is\s+\d+%|is\s+colou?red\b))/i,
      );
      if (compoundClauses.length > 1) {
        const simpleStart = line.text.indexOf(simpleStatement, labelRange.to - line.from);
        let searchFrom = simpleStart;
        let recognized = 0;
        for (const clause of compoundClauses) {
          const clauseStart = line.text.indexOf(clause, searchFrom);
          const clauseRange = range(line, clauseStart, clause);
          searchFrom = clauseStart + clause.length;
          const clauseDate = clause.match(
            /^(starts|ends)\s+(\d{4}[-/]\d{2}[-/]\d{2}|D[+-]\d+|today(?:[+-]\d+)?|\$[A-Za-z_]\w*|%date\(.+\)|the\s+.+?)$/i,
          );
          const clauseDuration = clause.match(/^(?:lasts|requires)\s+(\d+)\s+(days?|weeks?|months?)$/i);
          const clauseColor = clause.match(/^is\s+colou?red\s+in\s+(\S+)$/i);
          const clauseCompletion = clause.match(/^is\s+(\d+)%\s+completed$/i);
          if (clauseDate?.[1] && clauseDate[2]) {
            const valueStart = clauseStart + clause.lastIndexOf(clauseDate[2]);
            const expression = dateExpression(clauseDate[2], range(line, valueStart, clauseDate[2]));
            const kind = clauseDate[1].toLowerCase() === "starts" ? "start" : "end";
            if (kind === "start") task.start = expression;
            else task.end = expression;
            inlineDeclaration(task, kind, clauseRange);
            recognized += 1;
          } else if (clauseDuration?.[1] && clauseDuration[2]) {
            const unit = clauseDuration[2].toLowerCase();
            const valueStart = clauseStart + clause.indexOf(clauseDuration[1]);
            task.duration = {
              value: Number(clauseDuration[1]),
              range: range(line, valueStart, clauseDuration[1]),
              unit: unit.startsWith("month") ? "month" : unit.startsWith("week") ? "week" : "day",
            };
            inlineDeclaration(task, "duration", clauseRange);
            recognized += 1;
          } else if (clauseColor?.[1]) {
            const valueStart = clauseStart + clause.lastIndexOf(clauseColor[1]);
            task.color = { value: clauseColor[1], range: range(line, valueStart, clauseColor[1]) };
            inlineDeclaration(task, "color", clauseRange);
            recognized += 1;
          } else if (clauseCompletion?.[1]) {
            const valueStart = clauseStart + clause.indexOf(clauseCompletion[1]);
            task.completion = {
              value: Number(clauseCompletion[1]),
              range: range(line, valueStart, clauseCompletion[1]),
            };
            inlineDeclaration(task, "completion", clauseRange);
            recognized += 1;
          }
        }
        if (recognized === compoundClauses.length) continue;
      }

      const validModifier =
        /^(?:pauses\s+on\s+.+|displays\s+on\s+same\s+row\s+as\s+\[[^\]]+]|is\s+deleted)\s*$/i.test(
          statement,
        );
      const link = statement.match(/^links\s+to\s+\[\[(\S+?)(?:\s+(.+?))?]]\s*$/i);
      if (link?.[1]) {
        task.links = [...(task.links ?? []), { url: link[1], ...(link[2] ? { label: link[2] } : {}), sourceRange: lineRange }];
        declaration(task, "link", lineRange);
        continue;
      }
      const validCompound =
        /\s+and\s+/i.test(statement) && /\b(?:starts|ends|requires|lasts|is\s+colou?red)\b/i.test(statement);
      if (validModifier || validCompound) {
        declaration(task, "modifier", lineRange);
        continue;
      }

      declaration(task, "unknown", lineRange);
      const durationPrefix = statement.match(/^lasts\s+(.+)$/i);
      diagnostics.push({
        severity: "error",
        message: durationPrefix ? "Expected a positive duration followed by days or weeks" : "Malformed task statement",
        range: lineRange,
        code: durationPrefix ? "invalid-duration" : "malformed-statement",
      });
      continue;
    }

    unknown.push({ kind: "unknown", text: line.text, range: lineRange });
    diagnostics.push({
      severity: "info",
      message: "Preserved, but not visually editable",
      range: lineRange,
      code: "unsupported-syntax",
    });
  }

  if (!hasStart)
    diagnostics.unshift({
      severity: "error",
      message: "Expected @startgantt",
      range: { from: 0, to: 0 },
      code: "missing-start",
    });
  if (!hasEnd)
    diagnostics.push({
      severity: "error",
      message: "Expected @endgantt",
      range: { from: source.length, to: source.length },
      code: "missing-end",
    });

  for (const dependency of dependencies) {
    dependency.predecessorTaskId = taskReferences.get(dependency.predecessorTaskId) ?? dependency.predecessorTaskId;
    dependency.successorTaskId = taskReferences.get(dependency.successorTaskId) ?? dependency.successorTaskId;
    if (!taskMap.has(dependency.predecessorTaskId)) {
      diagnostics.push({
        severity: "error",
        message: `Unknown task reference: ${dependency.predecessor.value}`,
        range: dependency.predecessor.range,
        code: "unknown-task",
      });
    }
  }
  for (const task of taskMap.values()) {
    if (task.sameRowTaskId) {
      task.sameRowTaskId = taskReferences.get(task.sameRowTaskId) ?? task.sameRowTaskId;
      if (!taskMap.has(task.sameRowTaskId))
        diagnostics.push({
          severity: "error",
          message: `Unknown task reference: ${task.sameRowAs?.value ?? task.sameRowTaskId}`,
          range: task.sameRowAs?.range ?? task.sourceRange,
          code: "unknown-task",
        });
    }
    if (
      task.milestone &&
      !("resolved" in task.milestone) &&
      !taskMap.has(taskReferences.get(normalizeTaskId(task.milestone.value)) ?? normalizeTaskId(task.milestone.value))
    ) {
      diagnostics.push({
        severity: "error",
        message: `Unknown task reference: ${task.milestone.value}`,
        range: task.milestone.range,
        code: "unknown-task",
      });
    }
  }

  for (const note of noteBlocks) {
    const dependency = dependencies
      .filter((item) => item.sourceRange.to < note.sourceRange.from)
      .sort((a, b) => b.sourceRange.to - a.sourceRange.to)[0];
    const task = [...taskMap.values()]
      .flatMap((item) => item.declarations.map((declaration) => ({ item, range: declaration.range })))
      .filter((item) => item.range.to < note.sourceRange.from)
      .sort((a, b) => b.range.to - a.range.to)[0];
    if (dependency && (!task || dependency.sourceRange.to >= task.range.to))
      dependency.notes = [...(dependency.notes ?? []), note];
    else if (task) task.item.notes = [...(task.item.notes ?? []), note];
    else
      diagnostics.push({
        severity: "warning",
        message: "Note is not attached to a task or dependency",
        range: note.sourceRange,
        code: "orphan-note",
      });
  }

  const document: GanttDocument = {
    sourceRange: { from: 0, to: source.length },
    tasks: [...taskMap.values()],
    dependencies,
    dividers,
    verticalSeparators,
    unknown,
    symbols: { tasks: taskMap, references: taskReferences },
    ...(projectStart ? { projectStart } : {}),
  };
  return { document, diagnostics };
}
