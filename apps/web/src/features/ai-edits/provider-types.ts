import { AiEditError } from "./errors";
import type { AiUsage } from "./models";
import type { AiProviderRequest } from "./prompt";
import type { AiProviderId } from "./providers";

/** The one result every provider returns. Everything after it (checks, review, apply) is provider-blind. */
export interface AiEditProposal {
  /** Whole revised document. Empty when the model asked questions instead. */
  revisedSource: string;
  summary: string;
  questions: string[];
  usage: AiUsage;
  model: string;
}

export type AiProgress = { phase: "drafting"; receivedCharacters: number };

/** How a provider's own stop reason maps to the app's. */
export type AiStopReason = "finished" | "refused" | "too_long" | "cancelled";

/** What an adapter reads out of a provider's final message, before the shared checks run. */
export interface AiProviderReading {
  stopReason: AiStopReason;
  /** The model's JSON answer. Only read when `stopReason` is `finished`. */
  text: string;
  /** The provider's explanation for a refusal, when it gave one. */
  refusalReason?: string | undefined;
  usage: AiUsage;
  model?: string | undefined;
}

export interface AiProviderSendOptions {
  apiKey: string;
  model: string;
  request: AiProviderRequest;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: AiProgress) => void) | undefined;
  /** Injected by tests; each adapter casts it to its own client shape. */
  createClient?: ((apiKey: string) => unknown) | undefined;
}

/** One provider: turns the shared request into its API call and reads its answer back. */
export interface AiProviderAdapter {
  id: AiProviderId;
  /** The exact body sent to the API (the key travels in a header and is never part of it). */
  buildBody(request: AiProviderRequest, model: string): unknown;
  send(options: AiProviderSendOptions): Promise<AiEditProposal>;
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

/** Checks the stop reason before the content is read, then parses the answer. */
export function proposalFromReading(reading: AiProviderReading, requestedModel: string): AiEditProposal {
  if (reading.stopReason === "refused") {
    const reason = reading.refusalReason?.trim();
    throw new AiEditError(
      "refused",
      `The model declined this request${reason ? `: ${reason}` : "."} Nothing was changed. Rephrase the instruction or choose a different selection.`,
    );
  }
  if (reading.stopReason === "too_long") {
    throw new AiEditError(
      "truncated",
      "The answer was cut off because the document is too long for one reply. Select fewer lines and try again.",
    );
  }
  if (reading.stopReason === "cancelled") {
    throw new AiEditError("cancelled", "The request was cancelled. Nothing was changed.");
  }
  if (!reading.text) throw new AiEditError("bad_response", "The answer was empty. Try again.");
  return { ...parseProposalText(reading.text), usage: reading.usage, model: reading.model ?? requestedModel };
}
