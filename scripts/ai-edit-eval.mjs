#!/usr/bin/env node
/**
 * AI edit eval (slice A0). Runs the Sequence tasks in scripts/ai-edit-eval-tasks.mjs against the real prompt,
 * schema and provider code the app uses, scores each answer (parses, no new errors, expectations met, lines
 * outside the selection unchanged) and writes a JSON and a Markdown summary.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/ai-edit-eval.mjs --model claude-sonnet-5-5
 *
 * Options: --model <id>   model to test (default claude-opus-5-5)
 *          --limit <n>    run only the first n tasks
 *          --task <id>    run only one task (repeatable)
 *          --out <dir>    output directory (default output/ai-edit-eval, which is not committed)
 *          --yes          skip the cost confirmation
 *
 * It calls the paid API with your key, so it only runs when you start it. It refuses to run without
 * ANTHROPIC_API_KEY and prints an estimated cost before the first request.
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArguments(argv) {
  const options = { model: "claude-opus-5-5", limit: undefined, tasks: [], out: "output/ai-edit-eval", yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[(index += 1)];
      if (next === undefined) throw new Error(`${argument} needs a value`);
      return next;
    };
    if (argument === "--model") options.model = value();
    else if (argument === "--limit") options.limit = Number(value());
    else if (argument === "--task") options.tasks.push(value());
    else if (argument === "--out") options.out = value();
    else if (argument === "--yes") options.yes = true;
    else throw new Error(`Unknown option ${argument}`);
  }
  return options;
}

async function loadCore() {
  // Bundle the app's own TypeScript (prompt, provider, scoring, parsers) so the eval cannot drift from it.
  const outfile = path.join(root, "node_modules/.cache/ai-edit-eval/core.mjs");
  await build({
    entryPoints: [path.join(root, "apps/web/src/features/ai-edits/eval-entry.ts")],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "error",
    external: ["@anthropic-ai/sdk"],
  });
  return import(pathToFileURL(outfile).href);
}

function estimate(core, model, tasks) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const task of tasks) {
    const payload = core.buildRequestPayload({ kind: task.kind ?? "sequence", ...task }, model);
    inputTokens += Math.ceil((payload.system[0].text.length + payload.messages[0].content.length) / 3.5);
    outputTokens += Math.ceil(task.source.length / 3) + 200;
  }
  const costUsd = core.estimateCostUsd(model, {
    inputTokens,
    outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  return { inputTokens, outputTokens, costUsd };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. This script calls the paid Anthropic API with your key.");
    console.error("Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/ai-edit-eval.mjs --model claude-sonnet-5-5");
    process.exit(2);
  }
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const { tasks: allTasks } = await import("./ai-edit-eval-tasks.mjs");
  let tasks = options.tasks.length ? allTasks.filter((task) => options.tasks.includes(task.id)) : allTasks;
  if (options.limit !== undefined) tasks = tasks.slice(0, options.limit);
  if (!tasks.length) {
    console.error("No tasks selected.");
    process.exit(2);
  }

  const core = await loadCore();
  const guess = estimate(core, options.model, tasks);
  console.log(`Model: ${options.model}`);
  console.log(`Tasks: ${tasks.length}`);
  console.log(
    `Estimated cost: about $${guess.costUsd.toFixed(2)} (${guess.inputTokens} input and ${guess.outputTokens} output tokens, no cache hits assumed).`,
  );
  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Send these requests with your API key? [y/N] ");
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("Cancelled. Nothing was sent.");
      return;
    }
  }

  const scores = [];
  for (const task of tasks) {
    process.stdout.write(`${task.id} ... `);
    let proposal;
    let failure;
    try {
      proposal = await core.requestAiEdit({
        apiKey,
        model: options.model,
        request: {
          kind: task.kind ?? "sequence",
          source: task.source,
          selection: task.selection,
          instruction: task.instruction,
        },
      });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const usage = proposal?.usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const score = core.scoreResponse(task, proposal, usage, options.model);
    if (failure) score.checks.push({ name: "request", pass: false, detail: failure });
    if (proposal) score.response = proposal;
    scores.push(score);
    console.log(`${score.outcome}${score.scopeViolation ? " (scope violation)" : ""}`);
  }

  const summary = core.summarize(options.model, scores);
  const outDirectory = path.resolve(root, options.out);
  await mkdir(outDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(outDirectory, `${options.model}-${stamp}`);
  await writeFile(`${base}.json`, `${JSON.stringify({ summary, scores }, null, 2)}\n`);
  await writeFile(`${base}.md`, core.renderMarkdown(summary, tasks, scores));
  console.log(
    `\nValid output: ${summary.validCount}/${summary.tasks}. Scope violations: ${summary.scopeViolations}. Cost: $${summary.totalCostUsd.toFixed(4)}.`,
  );
  console.log(`Wrote ${base}.json and ${base}.md`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
