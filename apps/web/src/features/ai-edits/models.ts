import { AI_PROVIDERS, type AiProviderId } from "./providers";

export interface AiModelOption {
  id: string;
  provider: AiProviderId;
  label: string;
  description: string;
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
}

/**
 * The model list and price table. Prices change often: this is the one place to update them. A model that
 * is not listed (a custom id) runs with tokens shown and no cost estimate.
 */
export const AI_MODELS: readonly AiModelOption[] = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    description: "Best patch quality. $4 / $20 per million input / output tokens.",
    inputPerMillion: 4,
    outputPerMillion: 20,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    description: "Cheaper and faster. $2 / $10 per million input / output tokens.",
    inputPerMillion: 2,
    outputPerMillion: 10,
  },
  {
    id: "gpt-6.2-astra",
    provider: "openai",
    label: "GPT-6.2 Astra",
    description: "Most capable. $8 / $40 per million input / output tokens.",
    inputPerMillion: 8,
    outputPerMillion: 40,
  },
  {
    id: "gpt-6.2-sol",
    provider: "openai",
    label: "GPT-6.2 Sol",
    description: "Everyday model, recommended. $2 / $10 per million input / output tokens.",
    inputPerMillion: 2,
    outputPerMillion: 10,
  },
  {
    id: "gpt-6-luna",
    provider: "openai",
    label: "GPT-6 Luna",
    description: "Cheapest. $0.10 / $0.50 per million input / output tokens.",
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
  },
  {
    id: "grok-4.7",
    provider: "xai",
    label: "Grok 4.7",
    description: "Most capable, recommended. $2 / $6 per million input / output tokens.",
    inputPerMillion: 2,
    outputPerMillion: 6,
  },
  {
    id: "grok-4.3",
    provider: "xai",
    label: "Grok 4.3",
    description: "Cheaper. $1.25 / $2.50 per million input / output tokens.",
    inputPerMillion: 1.25,
    outputPerMillion: 2.5,
  },
];

export const DEFAULT_AI_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-6.2-sol",
  xai: "grok-4.7",
};

export const DEFAULT_AI_MODEL = DEFAULT_AI_MODELS.anthropic;

export function modelsFor(provider: AiProviderId): AiModelOption[] {
  return AI_MODELS.filter((model) => model.provider === provider);
}

export function findAiModel(provider: AiProviderId, id: string): AiModelOption | undefined {
  return AI_MODELS.find((model) => model.provider === provider && model.id === id);
}

export function isKnownAiModel(id: unknown, provider?: AiProviderId): id is string {
  return (
    typeof id === "string" && AI_MODELS.some((model) => model.id === id && (!provider || model.provider === provider))
  );
}

/** A model id typed by hand. Kept conservative: it ends up in a request body, never in markup or a URL. */
export function isValidModelId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(id);
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** True when the table has a price for this model id. */
export function hasPrice(modelId: string): boolean {
  return AI_MODELS.some((entry) => entry.id === modelId);
}

/**
 * Estimated cost in USD, from the per-model price table. Cache reads and writes use the provider's
 * multipliers on the input price. Unknown models cost 0 so a custom model id never breaks the summary:
 * callers show tokens only when `hasPrice` is false.
 *
 * `inputTokens` never includes the cache read/write tokens; the adapters normalise their API's counts.
 */
export function estimateCostUsd(modelId: string, usage: AiUsage): number {
  const model = AI_MODELS.find((entry) => entry.id === modelId);
  if (!model) return 0;
  const provider = AI_PROVIDERS[model.provider];
  const input = usage.inputTokens * model.inputPerMillion;
  const read = usage.cacheReadTokens * model.inputPerMillion * provider.cacheReadMultiplier;
  const write = usage.cacheWriteTokens * model.inputPerMillion * provider.cacheWriteMultiplier;
  const output = usage.outputTokens * model.outputPerMillion;
  return (input + read + write + output) / 1_000_000;
}
