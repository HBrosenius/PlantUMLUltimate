import { parseSequence } from "@plantuml-studio/diagram-sequence";
import { analyzeDiagram } from "../../diagram-diagnostics";
import type { DiagramKind } from "../../model";
import { estimateCostUsd, type AiUsage } from "./models";
import { SELECTION_END_MARKER, SELECTION_START_MARKER, type AiSelection } from "./prompt";
import { hasScopeViolation, measureScope } from "./selection-scope";

/**
 * Scoring for scripts/ai-edit-eval.mjs. Pure functions over a task and a model response, so they are tested
 * with canned responses and never need the API.
 */
export interface EvalExpectations {
  /** Participants (id, alias or label, case-insensitive) that must exist afterwards. */
  participants?: string[];
  /** Participants that must not exist afterwards. */
  absentParticipants?: string[];
  /** Substrings of message labels (case-insensitive) that must exist afterwards. */
  messages?: string[];
  /** Substrings of the revised source (case-insensitive) that must be present. */
  contains?: string[];
  /** Substrings of the revised source (case-insensitive) that must be absent. */
  notContains?: string[];
  /** Bounds on the number of messages afterwards. */
  messageCount?: { min?: number; max?: number };
  /** The model should ask a question instead of changing anything. */
  shouldAsk?: boolean;
}

export interface EvalTask {
  id: string;
  title: string;
  kind?: DiagramKind;
  instruction: string;
  source: string;
  selection: AiSelection;
  expect: EvalExpectations;
}

export interface EvalResponse {
  revisedSource: string;
  summary: string;
  questions: string[];
}

export interface EvalCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface TaskScore {
  id: string;
  /** "asked" means the model returned questions and no source. */
  outcome: "valid" | "invalid" | "asked" | "unexpected-question";
  /** Parses, adds no errors and meets the expectations (scope is reported separately). */
  valid: boolean;
  scopeViolation: boolean;
  checks: EvalCheck[];
  costUsd: number;
  usage: AiUsage;
}

const errorMessages = (kind: DiagramKind, source: string): string[] =>
  analyzeDiagram(kind, source)
    .diagnostics.filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.message);

const has = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle.toLowerCase());

export function scoreResponse(
  task: EvalTask,
  response: EvalResponse | undefined,
  usage: AiUsage,
  model: string,
): TaskScore {
  const kind = task.kind ?? "sequence";
  const checks: EvalCheck[] = [];
  const cost = estimateCostUsd(model, usage);
  const finish = (outcome: TaskScore["outcome"], valid: boolean, scopeViolation: boolean): TaskScore => ({
    id: task.id,
    outcome,
    valid,
    scopeViolation,
    checks,
    costUsd: cost,
    usage,
  });
  if (!response) {
    checks.push({ name: "response", pass: false, detail: "no usable response" });
    return finish("invalid", false, false);
  }
  const asked = response.questions.length > 0 && response.revisedSource.trim() === "";
  if (task.expect.shouldAsk) {
    checks.push({ name: "asks a question", pass: asked });
    return finish(asked ? "asked" : "invalid", asked, false);
  }
  if (asked) {
    checks.push({ name: "makes the change", pass: false, detail: `asked instead: ${response.questions[0]}` });
    return finish("unexpected-question", false, false);
  }

  const revised = response.revisedSource;
  const leaked = revised.includes(SELECTION_START_MARKER) || revised.includes(SELECTION_END_MARKER);
  checks.push({ name: "selection markers removed", pass: !leaked });
  const framed = /^\s*@startuml\b/i.test(revised) && /@enduml\s*$/i.test(revised);
  checks.push({ name: "has @startuml/@enduml", pass: framed });

  let document: ReturnType<typeof parseSequence> | undefined;
  try {
    document = parseSequence(revised);
  } catch (error) {
    checks.push({ name: "parses", pass: false, detail: String(error) });
  }
  if (document) checks.push({ name: "parses", pass: true });

  const before = errorMessages(kind, task.source);
  const added = errorMessages(kind, revised).filter((message) => {
    const index = before.indexOf(message);
    if (index === -1) return true;
    before.splice(index, 1);
    return false;
  });
  checks.push({
    name: "no new errors",
    pass: added.length === 0,
    ...(added.length ? { detail: added.join("; ") } : {}),
  });

  if (document) {
    const names = document.participants.flatMap((participant) =>
      [participant.id, participant.alias, participant.label].filter((value): value is string => Boolean(value)),
    );
    for (const wanted of task.expect.participants ?? []) {
      checks.push({
        name: `participant ${wanted} exists`,
        pass: names.some((name) => name.toLowerCase() === wanted.toLowerCase()),
      });
    }
    for (const unwanted of task.expect.absentParticipants ?? []) {
      checks.push({
        name: `participant ${unwanted} is gone`,
        pass: !names.some((name) => name.toLowerCase() === unwanted.toLowerCase()),
      });
    }
    for (const wanted of task.expect.messages ?? []) {
      checks.push({
        name: `message "${wanted}" exists`,
        pass: document.messages.some((message) => has(message.label, wanted)),
      });
    }
    const count = document.messages.length;
    const bounds = task.expect.messageCount;
    if (bounds?.min !== undefined)
      checks.push({ name: `at least ${bounds.min} messages`, pass: count >= bounds.min, detail: `${count}` });
    if (bounds?.max !== undefined)
      checks.push({ name: `at most ${bounds.max} messages`, pass: count <= bounds.max, detail: `${count}` });
  }
  for (const text of task.expect.contains ?? []) checks.push({ name: `contains "${text}"`, pass: has(revised, text) });
  for (const text of task.expect.notContains ?? [])
    checks.push({ name: `does not contain "${text}"`, pass: !has(revised, text) });
  checks.push({ name: "something changed", pass: revised !== task.source });

  const scope = measureScope(task.source, revised, task.selection);
  const scopeViolation = hasScopeViolation(scope);
  checks.push({
    name: "lines outside the selection unchanged",
    pass: !scopeViolation,
    ...(scopeViolation ? { detail: [...scope.removedOutside, ...scope.addedOutside].slice(0, 3).join(" | ") } : {}),
  });

  const valid = checks
    .filter((check) => check.name !== "lines outside the selection unchanged")
    .every((check) => check.pass);
  return finish(valid ? "valid" : "invalid", valid, scopeViolation);
}

export interface EvalSummary {
  model: string;
  tasks: number;
  validCount: number;
  validRate: number;
  scopeViolations: number;
  askedCount: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export function summarize(model: string, scores: readonly TaskScore[]): EvalSummary {
  const validCount = scores.filter((score) => score.valid).length;
  return {
    model,
    tasks: scores.length,
    validCount,
    validRate: scores.length ? validCount / scores.length : 0,
    scopeViolations: scores.filter((score) => score.scopeViolation).length,
    askedCount: scores.filter((score) => score.outcome === "asked").length,
    totalCostUsd: scores.reduce((sum, score) => sum + score.costUsd, 0),
    totalInputTokens: scores.reduce(
      (sum, score) => sum + score.usage.inputTokens + score.usage.cacheReadTokens + score.usage.cacheWriteTokens,
      0,
    ),
    totalOutputTokens: scores.reduce((sum, score) => sum + score.usage.outputTokens, 0),
  };
}

const money = (value: number) => `$${value.toFixed(4)}`;

export function renderMarkdown(summary: EvalSummary, tasks: readonly EvalTask[], scores: readonly TaskScore[]): string {
  const lines = [
    `# AI edit eval: ${summary.model}`,
    "",
    `- Tasks: ${summary.tasks}`,
    `- Valid output: ${summary.validCount}/${summary.tasks} (${(summary.validRate * 100).toFixed(0)}%)`,
    `- Scope violations (lines outside the selection changed): ${summary.scopeViolations}`,
    `- Asked a question instead: ${summary.askedCount}`,
    `- Tokens: ${summary.totalInputTokens} in, ${summary.totalOutputTokens} out`,
    `- Estimated cost: ${money(summary.totalCostUsd)}`,
    "",
    "| Task | Outcome | Scope | In | Out | Cost | Failed checks |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
  ];
  for (const score of scores) {
    const task = tasks.find((entry) => entry.id === score.id);
    const failed = score.checks
      .filter((check) => !check.pass)
      .map((check) => (check.detail ? `${check.name} (${check.detail})` : check.name))
      .join("; ")
      // Escape backslashes first, so a backslash in the text cannot undo the pipe escape.
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|");
    lines.push(
      `| ${task?.title ?? score.id} | ${score.outcome} | ${score.scopeViolation ? "violation" : "ok"} | ${
        score.usage.inputTokens + score.usage.cacheReadTokens + score.usage.cacheWriteTokens
      } | ${score.usage.outputTokens} | ${money(score.costUsd)} | ${failed || "-"} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
