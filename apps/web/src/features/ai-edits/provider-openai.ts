import type { ResponseCreateParamsBase } from "openai/resources/responses/responses";
import { AiEditError, mapAiError } from "./errors";
import type { AiProviderRequest } from "./prompt";
import {
  proposalFromReading,
  type AiEditProposal,
  type AiProviderAdapter,
  type AiProviderReading,
  type AiProviderSendOptions,
} from "./provider-types";
import type { AiProviderId } from "./providers";

/**
 * OpenAI and xAI share one adapter: xAI serves the same Responses API, reached through the same `openai`
 * SDK with a different base URL. Only the client's base URL and the error wording differ.
 */
export type OpenAiCompatibleId = Extract<AiProviderId, "openai" | "xai">;

export const XAI_BASE_URL = "https://api.x.ai/v1";

/** Reasoning models spend output tokens on thinking before the answer, so the visible budget is raised. */
const REASONING_HEADROOM_TOKENS = 8000;
const MAX_OUTPUT_TOKENS = 48000;
const SCHEMA_NAME = "plantuml_edit_proposal";

export type OpenAiRequestBody = Required<
  Pick<ResponseCreateParamsBase, "model" | "instructions" | "input" | "max_output_tokens" | "store" | "text">
>;

export interface OpenAiResponseLike {
  status?: string | undefined;
  model?: string | undefined;
  error?: { code?: string | null; message?: string | null } | null | undefined;
  incomplete_details?: { reason?: string | null } | null | undefined;
  output?: ReadonlyArray<{
    type: string;
    content?: ReadonlyArray<{ type: string; text?: string; refusal?: string }> | undefined;
  }>;
  usage?:
    | {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
      }
    | null
    | undefined;
}

/** The slice of the SDK's `ResponseStream` the adapter relies on. */
export interface OpenAiStreamLike {
  on(event: "response.output_text.delta", listener: (event: { delta: string }) => void): unknown;
  finalResponse(): Promise<OpenAiResponseLike>;
  abort(): void;
}

export interface OpenAiClientLike {
  responses: {
    stream(body: OpenAiRequestBody, options?: { signal?: AbortSignal }): OpenAiStreamLike;
  };
}

export type OpenAiClientFactory = (apiKey: string) => Promise<OpenAiClientLike> | OpenAiClientLike;

/** The exact body sent to the API (the key travels in a header and is never part of it). */
export function buildOpenAiBody(request: AiProviderRequest, model: string): OpenAiRequestBody {
  return {
    model,
    instructions: request.system,
    input: request.user,
    max_output_tokens: Math.min(MAX_OUTPUT_TOKENS, request.maxOutputTokens + REASONING_HEADROOM_TOKENS),
    // The assistant is stateless: the answer is not kept on the provider's side for later retrieval.
    store: false,
    text: { format: { type: "json_schema", name: SCHEMA_NAME, schema: request.schema, strict: true } },
  };
}

/** Creates the official SDK client. Loaded on first use so the SDK stays out of the initial bundle. */
export function createOpenAiClientFactory(provider: OpenAiCompatibleId): OpenAiClientFactory {
  return async (apiKey) => {
    const { default: OpenAI } = await import("openai");
    // The key goes from this browser straight to the provider's API, so the SDK's browser guard is acknowledged.
    return new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      ...(provider === "xai" ? { baseURL: XAI_BASE_URL } : {}),
    }) as unknown as OpenAiClientLike;
  };
}

/** Maps a Responses API result onto the app's stop reasons. Refusals arrive as an output content part. */
export function readOpenAiResponse(response: OpenAiResponseLike): AiProviderReading {
  const details = response.usage?.input_tokens_details;
  const cacheRead = details?.cached_tokens ?? 0;
  const cacheWrite = details?.cache_write_tokens ?? 0;
  // Here `input_tokens` includes cached tokens; the app counts them separately.
  const usage = {
    inputTokens: Math.max(0, (response.usage?.input_tokens ?? 0) - cacheRead - cacheWrite),
    outputTokens: response.usage?.output_tokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
  const base = { usage, model: response.model, text: "" };

  const parts = (response.output ?? []).filter((item) => item.type === "message").flatMap((item) => item.content ?? []);
  const refusal = parts.find((part) => part.type === "refusal");
  if (refusal) return { ...base, stopReason: "refused", refusalReason: refusal.refusal };

  if (response.status === "cancelled") return { ...base, stopReason: "cancelled" };
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason;
    if (reason === "content_filter")
      return { ...base, stopReason: "refused", refusalReason: "blocked by a content filter" };
    return { ...base, stopReason: "too_long" };
  }
  if (response.status === "failed") {
    const code = response.error?.code ?? "";
    if (code === "context_length_exceeded") return { ...base, stopReason: "too_long" };
    throw Object.assign(new Error(response.error?.message ?? "The response failed."), {
      status: code === "rate_limit_exceeded" ? 429 : 500,
    });
  }
  return {
    ...base,
    stopReason: "finished",
    text: parts
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join(""),
  };
}

export function readOpenAiFinalResponse(response: OpenAiResponseLike, requestedModel: string): AiEditProposal {
  return proposalFromReading(readOpenAiResponse(response), requestedModel);
}

function sendFor(provider: OpenAiCompatibleId) {
  const createDefault = createOpenAiClientFactory(provider);
  return async (options: AiProviderSendOptions): Promise<AiEditProposal> => {
    const { apiKey, model, request, signal, onProgress } = options;
    try {
      const client = await ((options.createClient as OpenAiClientFactory | undefined) ?? createDefault)(apiKey);
      const stream = client.responses.stream(buildOpenAiBody(request, model), signal ? { signal } : undefined);
      const abort = () => stream.abort();
      signal?.addEventListener("abort", abort, { once: true });
      let received = 0;
      stream.on("response.output_text.delta", (event) => {
        received += event.delta.length;
        onProgress?.({ phase: "drafting", receivedCharacters: received });
      });
      try {
        return readOpenAiFinalResponse(await stream.finalResponse(), model);
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    } catch (error) {
      throw error instanceof AiEditError ? error : mapAiError(error, signal, provider);
    }
  };
}

export const openAiAdapter: AiProviderAdapter = { id: "openai", buildBody: buildOpenAiBody, send: sendFor("openai") };
export const xaiAdapter: AiProviderAdapter = { id: "xai", buildBody: buildOpenAiBody, send: sendFor("xai") };
