import { AiEditError, mapAiError } from "./errors";
import type { AiUsage } from "./models";
import { buildRequestPayload, checkRequestSize, type AiEditRequest, type AiRequestPayload } from "./prompt";

/** Beta flag that enables `fallbacks: "default"` (server-side retry on a substitute model after a refusal). */
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AiEditProposal {
  /** Whole revised document. Empty when the model asked questions instead. */
  revisedSource: string;
  summary: string;
  questions: string[];
  usage: AiUsage;
  model: string;
}

export type AiProgress = { phase: "drafting"; receivedCharacters: number };

/** The slice of the SDK stream the provider relies on. The real `MessageStream` satisfies it. */
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

export type AiStreamBody = AiRequestPayload & { betas: string[]; fallbacks: "default" };

/** The exact body sent to the API (the key travels in a header and is never part of it). */
export function buildStreamBody(request: AiEditRequest, model: string): AiStreamBody {
  return { ...buildRequestPayload(request, model), fallbacks: "default", betas: [SERVER_SIDE_FALLBACK_BETA] };
}

export type AiClientFactory = (apiKey: string) => Promise<AiClientLike> | AiClientLike;

/** Creates the official SDK client. Loaded on first use so the SDK stays out of the initial bundle. */
export const createAnthropicClient: AiClientFactory = async (apiKey) => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // The key goes from this browser straight to the Anthropic API, so the SDK's browser guard is acknowledged.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) as unknown as AiClientLike;
};

export interface RequestAiEditOptions {
  apiKey: string | undefined;
  model: string;
  request: AiEditRequest;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: AiProgress) => void) | undefined;
  createClient?: AiClientFactory | undefined;
}

export function parseProposalText(text: string): { revisedSource: string; summary: string; questions: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AiEditError("bad_response", "The answer was not in the expected format. Try again.");
  }
  const record = value as { revisedSource?: unknown; summary?: unknown; questions?: unknown } | null;
  if (
    !record ||
    typeof record.revisedSource !== "string" ||
    typeof record.summary !== "string" ||
    !Array.isArray(record.questions) ||
    !record.questions.every((question) => typeof question === "string")
  ) {
    throw new AiEditError("bad_response", "The answer was not in the expected format. Try again.");
  }
  return {
    revisedSource: record.revisedSource,
    summary: record.summary,
    questions: record.questions as string[],
  };
}

function usageOf(message: AiMessageLike): AiUsage {
  return {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    cacheReadTokens: message.usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage?.cache_creation_input_tokens ?? 0,
  };
}

/** Checks `stop_reason` before the content is read. */
export function readFinalMessage(message: AiMessageLike, requestedModel: string): AiEditProposal {
  if (message.stop_reason === "refusal") {
    const reason = message.stop_details?.explanation?.trim();
    throw new AiEditError(
      "refused",
      `The model declined this request${reason ? `: ${reason}` : "."} Nothing was changed. Rephrase the instruction or choose a different selection.`,
    );
  }
  if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
    throw new AiEditError(
      "truncated",
      "The answer was cut off because the document is too long for one reply. Select fewer lines and try again.",
    );
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  if (!text) throw new AiEditError("bad_response", "The answer was empty. Try again.");
  return { ...parseProposalText(text), usage: usageOf(message), model: message.model ?? requestedModel };
}

/**
 * One Messages API call, streamed. Resolves only with the final message; the caller never sees a partial
 * proposal. Rejects with an `AiEditError` whose message is ready to show.
 */
export async function requestAiEdit(options: RequestAiEditOptions): Promise<AiEditProposal> {
  const { apiKey, model, request, signal, onProgress } = options;
  if (!apiKey) throw new AiEditError("no_key", "Add an API key in Settings > AI assistant first.");
  const size = checkRequestSize(request);
  if (!size.ok) throw new AiEditError("too_large", size.message);
  if (signal?.aborted) throw mapAiError(new Error("Request was aborted."), signal);
  try {
    const client = await (options.createClient ?? createAnthropicClient)(apiKey);
    const stream = client.beta.messages.stream(buildStreamBody(request, model), signal ? { signal } : undefined);
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
    throw mapAiError(error, signal);
  }
}
