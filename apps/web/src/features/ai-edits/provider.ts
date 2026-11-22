import { AiEditError, mapAiError } from "./errors";
import { buildProviderRequest, checkRequestSize, type AiEditRequest } from "./prompt";
import { anthropicAdapter } from "./provider-anthropic";
import { openAiAdapter, xaiAdapter } from "./provider-openai";
import type { AiStreamBody } from "./provider-anthropic";
import type { AiEditProposal, AiProgress, AiProviderAdapter } from "./provider-types";
import { DEFAULT_AI_PROVIDER, type AiProviderId } from "./providers";

export type { AiEditProposal, AiProgress, AiProviderAdapter, AiStopReason } from "./provider-types";
export { parseProposalText } from "./provider-types";
export {
  SERVER_SIDE_FALLBACK_BETA,
  readFinalMessage,
  type AiClientFactory,
  type AiClientLike,
  type AiMessageLike,
  type AiStreamBody,
  type AiStreamLike,
} from "./provider-anthropic";

const ADAPTERS: Record<AiProviderId, AiProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openAiAdapter,
  xai: xaiAdapter,
};

export const adapterFor = (provider: AiProviderId): AiProviderAdapter => ADAPTERS[provider];

/** The exact request body for a provider. The same object is sent to the API and shown in "What will be sent". */
export function buildProviderBody(provider: AiProviderId, request: AiEditRequest, model: string): unknown {
  return adapterFor(provider).buildBody(buildProviderRequest(request), model);
}

/** The Anthropic body (the provider the app started with). Kept for callers that name it explicitly. */
export const buildStreamBody = (request: AiEditRequest, model: string) =>
  anthropicAdapter.buildBody(buildProviderRequest(request), model) as AiStreamBody;

export interface RequestAiEditOptions {
  /** Defaults to Anthropic. */
  provider?: AiProviderId | undefined;
  apiKey: string | undefined;
  model: string;
  request: AiEditRequest;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: AiProgress) => void) | undefined;
  /** Injected by tests; shaped for the chosen provider's adapter. */
  createClient?: ((apiKey: string) => unknown) | undefined;
}

/**
 * One streamed API call to the chosen provider. Resolves only with the final message; the caller never sees a
 * partial proposal. Rejects with an `AiEditError` whose message is ready to show.
 */
export async function requestAiEdit(options: RequestAiEditOptions): Promise<AiEditProposal> {
  const { apiKey, model, request, signal, onProgress } = options;
  const provider = options.provider ?? DEFAULT_AI_PROVIDER;
  if (!apiKey) throw new AiEditError("no_key", "Add an API key in Settings > AI assistant first.");
  const size = checkRequestSize(request);
  if (!size.ok) throw new AiEditError("too_large", size.message);
  if (signal?.aborted) throw mapAiError(new Error("Request was aborted."), signal, provider);
  return adapterFor(provider).send({
    apiKey,
    model,
    request: buildProviderRequest(request),
    signal,
    onProgress,
    createClient: options.createClient,
  });
}
