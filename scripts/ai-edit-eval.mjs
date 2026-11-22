#!/usr/bin/env node
/**
 * AI edit eval (slice A0). Runs the Sequence tasks in scripts/ai-edit-eval-tasks.mjs against the real prompt,
 * schema and provider code the app uses, scores each answer (parses, no new errors, expectations met, lines
 * outside the selection unchanged) and writes a JSON and a Markdown summary.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/ai-edit-eval.mjs --model claude-sonnet-5-5
 *   OPENAI_API_KEY=sk-...        node scripts/ai-edit-eval.mjs --provider openai --model gpt-6.2-sol
 *   XAI_API_KEY=xai-...          node scripts/ai-edit-eval.mjs --provider xai --model grok-4.7
 *
 * Options: --provider <id> anthropic (default), openai or xai; the key comes from that provider's variable
 *          --model <id>    model to test (default: the provider's default model in the app)
 *          --limit <n>    run only the first n tasks
 *          --task <id>    run only one task (repeatable)
 *          --out <dir>    output directory (default output/ai-edit-eval, which is not committed)
 *          --yes          skip the cost confirmation
 *
 * It calls the paid API with your key, so it only runs when you start it. It refuses to run without the
 * provider's key variable (ANTHROPIC_API_KEY, OPENAI_API_KEY or XAI_API_KEY) and prints an estimated cost
 * before the first request. The same tasks, scoring and price table are used for every provider.
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PROVIDER_KEY_VARIABLES = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
};

export function parseArguments(argv) {
  const options = {
    provider: "anthropic",
    model: undefined,
    limit: undefined,
    tasks: [],
    out: "output/ai-edit-eval",
    yes: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[(index += 1)];
      if (next === undefined) throw new Error(`${argument} needs a value`);
      return next;
    };
    if (argument === "--provider") {
      options.provider = value();
      if (!(options.provider in PROVIDER_KEY_VARIABLES))
        throw new Error(`--provider must be one of: ${Object.keys(PROVIDER_KEY_VARIABLES).join(", ")}`);
    } else if (argument === "--model") options.model = value();
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
    external: ["@anthropic-ai/sdk", "openai"],
  });
  return import(pathToFileURL(outfile).href);
}

function estimate(core, model, tasks) {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const task of tasks) {
    const payload = core.buildProviderRequest({ kind: task.kind ?? "sequence", ...task });
    inputTokens += Math.ceil((payload.system.length + payload.user.length) / 3.5);
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
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const keyVariable = PROVIDER_KEY_VARIABLES[options.provider];
  const apiKey = process.env[keyVariable];
  if (!apiKey) {
    console.error(`${keyVariable} is not set. This script calls the paid ${options.provider} API with your key.`);
    console.error(`Run: ${keyVariable}=... node scripts/ai-edit-eval.mjs --provider ${options.provider} --model <id>`);
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
  options.model = options.model ?? core.DEFAULT_AI_MODELS[options.provider];
  const guess = estimate(core, options.model, tasks);
  console.log(`Provider: ${options.provider}`);
  console.log(`Model: ${options.model}`);
  console.log(`Tasks: ${tasks.length}`);
  console.log(
    core.hasPrice(options.model)
      ? `Estimated cost: about $${guess.costUsd.toFixed(2)} (${guess.inputTokens} input and ${guess.outputTokens} output tokens, no cache hits assumed).`
      : `Estimated usage: ${guess.inputTokens} input and ${guess.outputTokens} output tokens. This model has no entry in the price table, so no cost is estimated.`,
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
        provider: options.provider,
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
  const base = path.join(outDirectory, `${options.provider}-${options.model}-${stamp}`);
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
