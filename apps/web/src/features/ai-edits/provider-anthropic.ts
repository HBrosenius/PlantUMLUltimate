import { mapAiError } from "./errors";
import type { AiProviderRequest } from "./prompt";
import {
  proposalFromReading,
  type AiEditProposal,
  type AiProviderAdapter,
  type AiProviderReading,
  type AiProviderSendOptions,
} from "./provider-types";

/** Beta flag that enables `fallbacks: "default"` (server-side retry on a substitute model after a refusal). */
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The slice of the SDK stream the adapter relies on. The real `MessageStream` satisfies it. */
export interface AiStreamLike {
  on(event: "text", listener: (delta: string, snapshot: string) => void): unknown;
  finalMessage(): Promise<AiMessageLike>;
  abort(): void;
}

export interface AiMessageLike {
  content: ReadonlyArray<{ type: string; text?: string }>;
  stop_reason: string | null;
  stop_details?: { explanation?: string | null } | null;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
}

export interface AiClientLike {
  beta: {
    messages: {
      stream(body: AiStreamBody, options?: { signal?: AbortSignal }): AiStreamLike;
    };
  };
}

export interface AiStreamBody {
  model: string;
  max_tokens: number;
  system: Array<{ type: "text"; text: string; cache_control: { type: "ephemeral" } }>;
  messages: Array<{ role: "user"; content: string }>;
  output_config: { format: { type: "json_schema"; schema: Record<string, unknown> } };
  betas: string[];
  fallbacks: "default";
}

export type AiClientFactory = (apiKey: string) => Promise<AiClientLike> | AiClientLike;

/** The exact body sent to the API (the key travels in a header and is never part of it). */
export function buildAnthropicBody(request: AiProviderRequest, model: string): AiStreamBody {
  return {
    model,
    max_tokens: request.maxOutputTokens,
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: request.user }],
    output_config: { format: { type: "json_schema", schema: request.schema } },
    fallbacks: "default",
    betas: [SERVER_SIDE_FALLBACK_BETA],
  };
}

/** Creates the official SDK client. Loaded on first use so the SDK stays out of the initial bundle. */
export const createAnthropicClient: AiClientFactory = async (apiKey) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // The key goes from this browser straight to the Anthropic API, so the SDK's browser guard is acknowledged.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) as unknown as AiClientLike;
};

/** Maps Anthropic's `stop_reason` onto the app's. */
export function readAnthropicMessage(message: AiMessageLike): AiProviderReading {
  const usage = {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage?.cache_creation_input_tokens ?? 0,
  };
  const stopReason =
    message.stop_reason === "refusal"
      ? "refused"
      : message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded"
        ? "too_long"
        : "finished";
  return {
    stopReason,
    text: message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join(""),
    refusalReason: message.stop_details?.explanation ?? undefined,
    usage,
    model: message.model,
  };
}

/** Checks `stop_reason` before the content is read. */
export function readFinalMessage(message: AiMessageLike, requestedModel: string): AiEditProposal {
  return proposalFromReading(readAnthropicMessage(message), requestedModel);
}

async function send(options: AiProviderSendOptions): Promise<AiEditProposal> {
  const { apiKey, model, request, signal, onProgress } = options;
  try {
    const client = await ((options.createClient as AiClientFactory | undefined) ?? createAnthropicClient)(apiKey);
    const stream = client.beta.messages.stream(buildAnthropicBody(request, model), signal ? { signal } : undefined);
    const abort = () => stream.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let received = 0;
    stream.on("text", (delta) => {
      received += delta.length;
      onProgress?.({ phase: "drafting", receivedCharacters: received });
    });
    try {
      return readFinalMessage(await stream.finalMessage(), model);
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  } catch (error) {
    throw mapAiError(error, signal, "anthropic");
  }
}

export const anthropicAdapter: AiProviderAdapter = { id: "anthropic", buildBody: buildAnthropicBody, send };
