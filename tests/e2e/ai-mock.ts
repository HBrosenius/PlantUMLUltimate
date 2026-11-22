import type { Page } from "@playwright/test";

/** What the mocked Anthropic API answers with. The real API is never called from tests. */
export interface MockReply {
  /** The structured answer the model returns. */
  answer?: { revisedSource: string; summary: string; questions: string[] };
  stopReason?: "end_turn" | "refusal" | "max_tokens";
  refusalExplanation?: string;
  /** An HTTP error instead of a stream. */
  httpStatus?: number;
  /** Do not answer until this resolves (for the cancel test). */
  hold?: Promise<void>;
}

export interface MockedRequest {
  body: {
    model: string;
    fallbacks?: unknown;
    system: Array<{ text: string; cache_control?: unknown }>;
    messages: Array<{ role: string; content: string }>;
    output_config?: { format?: { type: string } };
  };
  headers: Record<string, string>;
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-expose-headers": "*",
};

const sse = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function stream(reply: MockReply, model: string): string {
  const text = JSON.stringify(reply.answer ?? { revisedSource: "", summary: "", questions: [] });
  const stopReason = reply.stopReason ?? "end_turn";
  const usage = {
    input_tokens: 1200,
    output_tokens: 1,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  const middle = Math.ceil(text.length / 2);
  return [
    sse("message_start", {
      type: "message_start",
      message: {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage,
      },
    }),
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: text.slice(0, middle) },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: text.slice(middle) },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse("message_delta", {
      type: "message_delta",
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
        ...(stopReason === "refusal"
          ? { stop_details: { type: "refusal", category: null, explanation: reply.refusalExplanation ?? null } }
          : {}),
      },
      usage: { output_tokens: 300 },
    }),
    sse("message_stop", { type: "message_stop" }),
  ].join("");
}

/**
 * Intercepts every request to api.anthropic.com, answers the CORS preflight, and replies to each message
 * request with the next entry of `replies` as a server-sent event stream. Returns the recorded requests.
 */
export async function mockAnthropic(page: Page, replies: MockReply[]): Promise<MockedRequest[]> {
  const requests: MockedRequest[] = [];
  await page.route("https://api.anthropic.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    requests.push({ body: request.postDataJSON(), headers: await request.allHeaders() });
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)] ?? {};
    if (reply.hold) await reply.hold;
    if (reply.httpStatus) {
      await route
        .fulfill({
          status: reply.httpStatus,
          headers: { ...cors, "content-type": "application/json" },
          body: JSON.stringify({ type: "error", error: { type: "api_error", message: "mock failure" } }),
        })
        .catch(() => undefined);
      return;
    }
    await route
      .fulfill({
        status: 200,
        headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: stream(reply, requests[requests.length - 1]!.body.model),
      })
      .catch(() => undefined);
  });
  return requests;
}
