import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderMarkdown, scoreResponse, summarize, type EvalTask } from "./eval-scoring";
import { measureScope } from "./selection-scope";

const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };
const SOURCE = ["@startuml", "participant A", "participant B", "A -> B : save", "B --> A : saved", "@enduml"].join(
  "\n",
);
const task: EvalTask = {
  id: "timeout",
  title: "Add a timeout path",
  instruction: "Add a timeout path to the save call.",
  source: SOURCE,
  selection: { startLine: 4, endLine: 5 },
  expect: { messages: ["timeout"], contains: ["alt", "else"] },
};
const good = [
  "@startuml",
  "participant A",
  "participant B",
  "alt ok",
  "A -> B : save",
  "B --> A : saved",
  "else timeout",
  "B --> A : timeout",
  "end",
  "@enduml",
].join("\n");
const response = (revisedSource: string) => ({ revisedSource, summary: "x", questions: [] });

describe("scoreResponse with canned responses", () => {
  it("accepts a valid proposal inside the selection", () => {
    const score = scoreResponse(task, response(good), usage, "claude-opus-5-5");
    expect(score.checks.filter((check) => !check.pass)).toEqual([]);
    expect(score).toMatchObject({ outcome: "valid", valid: true, scopeViolation: false });
    expect(score.costUsd).toBeCloseTo((1000 * 4 + 200 * 20) / 1_000_000);
  });

  it("flags lines changed outside the selection as a scope violation without calling the output invalid", () => {
    const rewritten = good.replace("participant A", "actor A");
    const score = scoreResponse(task, response(rewritten), usage, "claude-opus-5-5");
    expect(score.scopeViolation).toBe(true);
    expect(score.valid).toBe(true);
    expect(score.checks.find((check) => check.name.startsWith("lines outside"))?.detail).toContain("participant A");
  });

  it("allows a new participant declaration outside the selection", () => {
    const withDeclaration = good.replace("participant B", "participant B\nparticipant Timer");
    expect(scoreResponse(task, response(withDeclaration), usage, "m").scopeViolation).toBe(false);
  });

  it("fails output that does not parse into the expectation, adds errors or leaks markers", () => {
    const missing = scoreResponse(task, response(SOURCE.replace("saved", "done")), usage, "m");
    expect(missing.valid).toBe(false);
    expect(missing.checks.some((check) => !check.pass && check.name.includes("timeout"))).toBe(true);

    const broken = scoreResponse(task, response(good.replace("end\n", "")), usage, "m");
    expect(broken.valid).toBe(false);
    expect(broken.checks.find((check) => check.name === "no new errors")?.pass).toBe(false);

    const leaked = scoreResponse(task, response(`${good}\n[[[SELECTION_END]]]`), usage, "m");
    expect(leaked.checks.find((check) => check.name === "selection markers removed")?.pass).toBe(false);

    const unchanged = scoreResponse(task, response(SOURCE), usage, "m");
    expect(unchanged.checks.find((check) => check.name === "something changed")?.pass).toBe(false);
  });

  it("does not blame the proposal for errors the original already had", () => {
    const flawed: EvalTask = {
      ...task,
      source: SOURCE.replace("@enduml", "alt open\n@enduml"),
      selection: { startLine: 4, endLine: 5 },
    };
    const score = scoreResponse(flawed, response(good.replace("@enduml", "alt open\n@enduml")), usage, "m");
    expect(score.checks.find((check) => check.name === "no new errors")?.pass).toBe(true);
  });

  it("handles questions: wrong when a change was expected, right when information is missing", () => {
    const asked = { revisedSource: "", summary: "", questions: ["How long?"] };
    expect(scoreResponse(task, asked, usage, "m")).toMatchObject({ outcome: "unexpected-question", valid: false });
    const needsInfo: EvalTask = { ...task, expect: { shouldAsk: true } };
    expect(scoreResponse(needsInfo, asked, usage, "m")).toMatchObject({ outcome: "asked", valid: true });
    expect(scoreResponse(needsInfo, response(good), usage, "m")).toMatchObject({ outcome: "invalid", valid: false });
  });

  it("scores a failed request as invalid", () => {
    expect(scoreResponse(task, undefined, usage, "m")).toMatchObject({ outcome: "invalid", valid: false });
  });
});

describe("summary and report", () => {
  it("computes rates, scope violations and cost and renders a table", () => {
    const scores = [
      scoreResponse(task, response(good), usage, "claude-sonnet-5-5"),
      scoreResponse(task, response(good.replace("participant A", "actor A")), usage, "claude-sonnet-5-5"),
      scoreResponse(task, undefined, { ...usage, inputTokens: 0, outputTokens: 0 }, "claude-sonnet-5-5"),
    ];
    const summary = summarize("claude-sonnet-5-5", scores);
    expect(summary).toMatchObject({ tasks: 3, validCount: 2, scopeViolations: 1 });
    expect(summary.validRate).toBeCloseTo(2 / 3);
    expect(summary.totalCostUsd).toBeCloseTo(2 * ((1000 * 2 + 200 * 10) / 1_000_000));
    const markdown = renderMarkdown(summary, [task], scores);
    expect(markdown).toContain("Valid output: 2/3 (67%)");
    expect(markdown).toContain("| Add a timeout path | valid | ok |");
    expect(markdown).toContain("violation");
  });

  it("escapes backslashes before pipes in failed-check text", () => {
    const score = scoreResponse(task, response(good), usage, "claude-sonnet-5-5");
    const failing = {
      ...score,
      checks: [{ name: "contains", pass: false, detail: String.raw`a\|b` }],
    };
    const markdown = renderMarkdown(summarize("claude-sonnet-5-5", [failing]), [task], [failing]);
    expect(markdown).toContain(String.raw`contains (a\\\|b)`);
  });
});

describe("measureScope", () => {
  it("counts removed and added lines outside the selection", () => {
    const report = measureScope(SOURCE, good.replace("participant A", "actor A"), task.selection);
    expect(report.removedOutside).toEqual(["participant A"]);
    expect(report.declarationsOutside).toEqual(["actor A"]);
    expect(report.touchedShare).toBeCloseTo(0.25);
    expect(measureScope(SOURCE, good, undefined).touchedShare).toBe(0);
  });
});

describe("the task file and the script", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../../../../..");
  const tasksPath = path.join(root, "scripts/ai-edit-eval-tasks.mjs");

  it("has about thirty well-formed Sequence tasks whose selections and sources are consistent", async () => {
    const module = (await import(/* @vite-ignore */ new URL(`file:///${tasksPath.replace(/\\/g, "/")}`).href)) as {
      tasks: EvalTask[];
    };
    expect(module.tasks.length).toBeGreaterThanOrEqual(30);
    expect(new Set(module.tasks.map((entry) => entry.id)).size).toBe(module.tasks.length);
    for (const entry of module.tasks) {
      const lines = entry.source.split("\n");
      expect(entry.selection.startLine, entry.id).toBeGreaterThanOrEqual(1);
      expect(entry.selection.endLine, entry.id).toBeLessThanOrEqual(lines.length);
      expect(entry.selection.startLine, entry.id).toBeLessThanOrEqual(entry.selection.endLine);
      expect(entry.instruction.length, entry.id).toBeGreaterThan(10);
      // Doing nothing must never count as success.
      const unchanged = scoreResponse(entry, response(entry.source), usage, "claude-opus-5-5");
      expect(unchanged.valid, entry.id).toBe(false);
    }
  });

  it("refuses to run without ANTHROPIC_API_KEY and never reaches the network", () => {
    const { ANTHROPIC_API_KEY: _removed, ...environment } = process.env;
    void _removed;
    const result = spawnSync(process.execPath, [path.join(root, "scripts/ai-edit-eval.mjs"), "--yes"], {
      env: environment,
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ANTHROPIC_API_KEY is not set");
  });
});
