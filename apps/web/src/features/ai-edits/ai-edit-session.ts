import { AiEditError } from "./errors";
import type { AiEditProposal, AiProgress, RequestAiEditOptions } from "./provider";
import type { AiEditRequest } from "./prompt";
import { checkProposal, type ProposalCheckResult } from "./proposal-checks";
import type { AiUsage } from "./models";

export type AiEditPhase = "drafting" | "checking" | "retrying";

export type AiEditOutcome =
  | {
      type: "proposal";
      /** The checked proposal, rebased onto newer edits when needed. */
      source: string;
      rebased: boolean;
      summary: string;
      warnings: string[];
      rewrite?: { share: number; changedLines: number } | undefined;
      usage: AiUsage;
      model: string;
      /** True when the proposal passed only on the automatic retry. */
      retried: boolean;
    }
  | { type: "questions"; questions: string[]; usage: AiUsage }
  | { type: "failed"; message: string; problems: string[]; code: string; usage: AiUsage; retried: boolean }
  | { type: "cancelled"; usage: AiUsage };

export interface RunAiEditOptions {
  request: AiEditRequest;
  apiKey: string | undefined;
  model: string;
  /** Read at check time: the document may have changed while the request ran. */
  getCurrentSource(): string;
  signal?: AbortSignal | undefined;
  onPhase?: ((phase: AiEditPhase) => void) | undefined;
  onProgress?: ((progress: AiProgress) => void) | undefined;
  /** Injected by tests; defaults to the provider. */
  send: (options: RequestAiEditOptions) => Promise<AiEditProposal>;
  createClient?: RequestAiEditOptions["createClient"];
}

const ZERO: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const add = (a: AiUsage, b: AiUsage): AiUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
});

/** Failures the model can plausibly fix when told what was wrong. A stale document cannot be fixed that way. */
const retryable = (result: Extract<ProposalCheckResult, { ok: false }>) => result.reason !== "stale";

/**
 * One user request: ask, check, and when the proposal fails the checks ask once more with the problems fed
 * back. Never throws: every outcome is a value the dialog can show.
 */
export async function runAiEdit(options: RunAiEditOptions): Promise<AiEditOutcome> {
  let usage = ZERO;
  let request = options.request;
  for (const attempt of [0, 1]) {
    options.onPhase?.(attempt === 0 ? "drafting" : "retrying");
    let proposal: AiEditProposal;
    try {
      proposal = await options.send({
        apiKey: options.apiKey,
        model: options.model,
        request,
        signal: options.signal,
        onProgress: options.onProgress,
        createClient: options.createClient,
      });
    } catch (error) {
      const failure = error instanceof AiEditError ? error : new AiEditError("unknown", "Something went wrong.");
      if (failure.code === "cancelled") return { type: "cancelled", usage };
      return {
        type: "failed",
        message: failure.message,
        problems: [],
        code: failure.code,
        usage,
        retried: attempt === 1,
      };
    }
    usage = add(usage, proposal.usage);
    if (proposal.questions.length > 0 && !proposal.revisedSource.trim())
      return { type: "questions", questions: proposal.questions, usage };

    options.onPhase?.("checking");
    const result = checkProposal({
      kind: request.kind,
      original: request.source,
      current: options.getCurrentSource(),
      proposal: proposal.revisedSource,
      selection: request.selection,
    });
    if (result.ok) {
      return {
        type: "proposal",
        source: result.source,
        rebased: result.rebased,
        summary: proposal.summary,
        warnings: result.warnings,
        rewrite: result.rewrite,
        usage,
        model: proposal.model,
        retried: attempt === 1,
      };
    }
    if (attempt === 1 || !retryable(result))
      return {
        type: "failed",
        message: result.message,
        problems: result.problems,
        code: result.reason,
        usage,
        retried: attempt === 1,
      };
    request = { ...options.request, previousProblems: result.problems };
  }
  return {
    type: "failed",
    message: "The assistant did not produce a usable proposal.",
    problems: [],
    code: "unknown",
    usage,
    retried: true,
  };
}

/** Appends the user's answers to the instruction for the resend after a questions round. */
export function instructionWithAnswers(
  instruction: string,
  questions: readonly string[],
  answers: readonly string[],
): string {
  const lines = questions.map((question, index) => `Q: ${question}\nA: ${answers[index]?.trim() || "(no answer)"}`);
  return `${instruction.trim()}\n\nAnswers to your questions:\n${lines.join("\n")}`;
}
