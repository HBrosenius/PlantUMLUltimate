/** The AI providers the assistant can talk to. Everything provider-specific that the UI needs lives here. */
export type AiProviderId = "anthropic" | "openai" | "xai";

export interface AiProviderInfo {
  id: AiProviderId;
  /** Name shown in Settings and the dialog. */
  label: string;
  /** Company that receives the text, for the consent screen. */
  recipient: string;
  /** Host shown in the consent text and "What will be sent". */
  host: string;
  /** Full endpoint the request goes to. */
  endpoint: string;
  /** Where the user creates an API key. */
  consoleUrl: string;
  consoleHostLabel: string;
  consoleName: string;
  keyPlaceholder: string;
  /** Sentence about subscriptions that do not include API access. */
  subscriptionNote: string;
  /** Multiplier on the input price for tokens read from the prompt cache. */
  cacheReadMultiplier: number;
  /** Multiplier on the input price for tokens written to the prompt cache. */
  cacheWriteMultiplier: number;
}

export const AI_PROVIDER_IDS: readonly AiProviderId[] = ["anthropic", "openai", "xai"];

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    recipient: "Anthropic",
    host: "api.anthropic.com",
    endpoint: "https://api.anthropic.com/v1/messages",
    consoleUrl: "https://platform.claude.com/",
    consoleHostLabel: "platform.claude.com",
    consoleName: "Claude Console",
    keyPlaceholder: "sk-ant-...",
    subscriptionNote: "A Claude Pro or Max subscription does not include API access and cannot be used here.",
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    recipient: "OpenAI",
    host: "api.openai.com",
    endpoint: "https://api.openai.com/v1/responses",
    consoleUrl: "https://platform.openai.com/",
    consoleHostLabel: "platform.openai.com",
    consoleName: "OpenAI platform",
    keyPlaceholder: "sk-...",
    subscriptionNote: "A ChatGPT subscription does not include API access and cannot be used here.",
    // Approximate: cached input is discounted and cache writes carry no surcharge.
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1,
  },
  xai: {
    id: "xai",
    label: "xAI",
    recipient: "xAI",
    host: "api.x.ai",
    endpoint: "https://api.x.ai/v1/responses",
    consoleUrl: "https://console.x.ai/",
    consoleHostLabel: "console.x.ai",
    consoleName: "xAI console",
    keyPlaceholder: "xai-...",
    subscriptionNote: "A Grok or X Premium subscription does not include API access and cannot be used here.",
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1,
  },
};

export const DEFAULT_AI_PROVIDER: AiProviderId = "anthropic";

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "anthropic" || value === "openai" || value === "xai";
}
