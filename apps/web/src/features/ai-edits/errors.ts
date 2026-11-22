export type AiEditErrorCode =
  | "no_key"
  | "bad_key"
  | "forbidden"
  | "rate_limited"
  | "overloaded"
  | "network"
  | "too_large"
  | "invalid_request"
  | "cancelled"
  | "refused"
  | "truncated"
  | "bad_response"
  | "server"
  | "unknown";

/** An error whose message is already written for the user. */
export class AiEditError extends Error {
  readonly code: AiEditErrorCode;
  constructor(code: AiEditErrorCode, message: string) {
    super(message);
    this.name = "AiEditError";
    this.code = code;
  }
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Maps SDK errors (by HTTP status, so the SDK need not be loaded to read them) to plain messages.
 * The raw error text is never shown: it can echo request details.
 */
export function mapAiError(error: unknown, signal?: AbortSignal): AiEditError {
  if (error instanceof AiEditError) return error;
  const name = (error as { name?: unknown } | null)?.name;
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  if (
    signal?.aborted ||
    name === "AbortError" ||
    name === "APIUserAbortError" ||
    /request was aborted/i.test(message)
  ) {
    return new AiEditError("cancelled", "The request was cancelled. Nothing was changed.");
  }
  const status = statusOf(error);
  if (status === 401)
    return new AiEditError("bad_key", "The API key was not accepted. Check it in Settings > AI assistant.");
  if (status === 403)
    return new AiEditError(
      "forbidden",
      "This API key is not allowed to use that model. Pick another model or check the key in the Claude Console.",
    );
  if (status === 413)
    return new AiEditError("too_large", "The request was too large for the service. Select fewer lines and try again.");
  if (status === 429)
    return new AiEditError("rate_limited", "The service is rate limiting this key. Wait a moment and try again.");
  if (status === 529 || /overloaded/i.test(message))
    return new AiEditError("overloaded", "The service is busy right now. Try again in a minute.");
  if (status === 400 || status === 422)
    return new AiEditError(
      "invalid_request",
      /credit balance/i.test(message)
        ? "The account behind this key has no credits left. Add credits in the Claude Console."
        : "The service rejected the request. Shorten the instruction or the selection and try again.",
    );
  if (status !== undefined && status >= 500)
    return new AiEditError("server", "The service had an error. Try again in a minute.");
  if (
    status === undefined &&
    (name === "APIConnectionError" ||
      name === "APIConnectionTimeoutError" ||
      /connection|fetch|network|timed out/i.test(message))
  )
    return new AiEditError("network", "Could not reach the service. Check your connection and try again.");
  return new AiEditError("unknown", "Something went wrong while contacting the service. Nothing was changed.");
}
