export interface AiModelOption {
  id: string;
  label: string;
  description: string;
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
}

export const AI_MODELS: readonly AiModelOption[] = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    description: "Best patch quality. $4 / $20 per million input / output tokens.",
    inputPerMillion: 4,
    outputPerMillion: 20,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "Cheaper and faster. $2 / $10 per million input / output tokens.",
    inputPerMillion: 2,
    outputPerMillion: 10,
  },
];

export const DEFAULT_AI_MODEL = "claude-opus-5-5";

export function isKnownAiModel(id: unknown): id is string {
  return typeof id === "string" && AI_MODELS.some((model) => model.id === id);
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Estimated cost in USD. Cache reads are billed at 10% and cache writes at 125% of the input price.
 * Unknown models cost 0 so a custom model id never breaks the summary.
 */
export function estimateCostUsd(modelId: string, usage: AiUsage): number {
  const model = AI_MODELS.find((entry) => entry.id === modelId);
  if (!model) return 0;
  const input = usage.inputTokens * model.inputPerMillion;
  const read = usage.cacheReadTokens * model.inputPerMillion * 0.1;
  const write = usage.cacheWriteTokens * model.inputPerMillion * 1.25;
  const output = usage.outputTokens * model.outputPerMillion;
  return (input + read + write + output) / 1_000_000;
}
