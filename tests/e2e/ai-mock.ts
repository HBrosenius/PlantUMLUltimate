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

/** What the mocked OpenAI or xAI Responses API answers with, beside the shared `MockReply` fields. */
export interface ResponsesMockReply extends MockReply {
  /** A refusal part instead of an answer (structured outputs can return one). */
  refusal?: string;
  /** An incomplete response instead of a finished one. */
  incompleteReason?: "max_output_tokens" | "content_filter";
  /** The message of an HTTP error (xAI answers a wrong key with 400 and a message about the key). */
  httpMessage?: string;
}

export interface MockedResponsesRequest {
  body: {
    model: string;
    instructions: string;
    input: string;
    max_output_tokens: number;
    store: boolean;
    stream?: boolean;
    text: { format: { type: string; strict?: boolean; name?: string; schema?: unknown } };
  };
  headers: Record<string, string>;
}

function responsesStream(reply: ResponsesMockReply, model: string): string {
  let sequence = 0;
  const event = (data: { type: string } & Record<string, unknown>) =>
    `event: ${data.type}\ndata: ${JSON.stringify({ ...data, sequence_number: (sequence += 1) })}\n\n`;
  const text = JSON.stringify(reply.answer ?? { revisedSource: "", summary: "", questions: [] });
  const usage = {
    input_tokens: 1500,
    input_tokens_details: { cached_tokens: 1000, cache_write_tokens: 0 },
    output_tokens: 300,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 1800,
  };
  const base = {
    id: "resp_mock",
    object: "response",
    created_at: 1_760_000_000,
    model,
    parallel_tool_calls: false,
    tool_choice: "auto",
    tools: [],
    metadata: null,
    temperature: null,
    top_p: null,
    error: null,
    incomplete_details: null,
    instructions: null,
  };
  const message = (content: object[], status: "in_progress" | "completed" | "incomplete") => ({
    id: "msg_mock",
    type: "message",
    role: "assistant",
    status,
    content,
  });
  const part = reply.refusal
    ? { type: "refusal", refusal: reply.refusal }
    : { type: "output_text", text, annotations: [] };
  const emptyPart = reply.refusal
    ? { type: "refusal", refusal: "" }
    : { type: "output_text", text: "", annotations: [] };
  const middle = Math.ceil(text.length / 2);
  const location = { item_id: "msg_mock", output_index: 0, content_index: 0 };
  const events = [
    event({ type: "response.created", response: { ...base, status: "in_progress", output: [], usage: null } }),
    event({ type: "response.output_item.added", output_index: 0, item: message([], "in_progress") }),
    event({ type: "response.content_part.added", ...location, part: emptyPart }),
  ];
  if (reply.refusal) {
    events.push(
      event({ type: "response.refusal.delta", ...location, delta: reply.refusal }),
      event({ type: "response.refusal.done", ...location, refusal: reply.refusal }),
    );
  } else {
    events.push(
      event({ type: "response.output_text.delta", ...location, delta: text.slice(0, middle), logprobs: [] }),
      event({ type: "response.output_text.delta", ...location, delta: text.slice(middle), logprobs: [] }),
      event({ type: "response.output_text.done", ...location, text, logprobs: [] }),
    );
  }
  const status = reply.incompleteReason ? "incomplete" : "completed";
  const done = { ...base, status, output: [message([part], status)], usage };
  events.push(
    event({ type: "response.content_part.done", ...location, part }),
    event({ type: "response.output_item.done", output_index: 0, item: message([part], status) }),
    reply.incompleteReason
      ? event({
          type: "response.incomplete",
          response: { ...done, incomplete_details: { reason: reply.incompleteReason } },
        })
      : event({ type: "response.completed", response: done }),
  );
  return events.join("");
}

async function mockResponsesApi(page: Page, origin: string, replies: ResponsesMockReply[]) {
  const requests: MockedResponsesRequest[] = [];
  await page.route(`${origin}/**`, async (route) => {
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
          body: JSON.stringify({
            error: { message: reply.httpMessage ?? "mock failure", type: "mock_error", code: null },
          }),
        })
        .catch(() => undefined);
      return;
    }
    await route
      .fulfill({
        status: 200,
        headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" },
        body: responsesStream(reply, requests[requests.length - 1]!.body.model),
      })
      .catch(() => undefined);
  });
  return requests;
}

/** Intercepts every request to api.openai.com (the real API is never called from tests). */
export const mockOpenAi = (page: Page, replies: ResponsesMockReply[]) =>
  mockResponsesApi(page, "https://api.openai.com", replies);

/** Intercepts every request to api.x.ai (the real API is never called from tests). */
export const mockXai = (page: Page, replies: ResponsesMockReply[]) =>
  mockResponsesApi(page, "https://api.x.ai", replies);
