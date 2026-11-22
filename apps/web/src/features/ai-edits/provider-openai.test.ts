import { describe, expect, it, vi } from "vitest";
import type { AiEditError } from "./errors";
import type { AiEditRequest } from "./prompt";
import {
  buildOpenAiBody,
  readOpenAiResponse,
  type OpenAiClientLike,
  type OpenAiRequestBody,
  type OpenAiResponseLike,
} from "./provider-openai";
import { buildProviderBody, requestAiEdit } from "./provider";
import { buildProviderRequest } from "./prompt";

const SOURCE = "@startuml\nA -> B : hello\n@enduml";
const request: AiEditRequest = {
  kind: "sequence",
  source: SOURCE,
  selection: { startLine: 2, endLine: 2 },
  instruction: "Add a reply",
};

const textResponse = (value: object, extra: Partial<OpenAiResponseLike> = {}): OpenAiResponseLike => ({
  status: "completed",
  model: "gpt-6.2-sol-2026-11-01",
  output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
  usage: {
    input_tokens: 220,
    output_tokens: 90,
    input_tokens_details: { cached_tokens: 100, cache_write_tokens: 0 },
  },
  ...extra,
});

function clientReturning(response: OpenAiResponseLike | Error, deltas: string[] = []) {
  const bodies: OpenAiRequestBody[] = [];
  const options: Array<{ signal?: AbortSignal } | undefined> = [];
  const stream = vi.fn((body: OpenAiRequestBody, option?: { signal?: AbortSignal }) => {
    bodies.push(body);
    options.push(option);
    const listeners: Array<(event: { delta: string }) => void> = [];
    return {
      on: (_event: "response.output_text.delta", listener: (event: { delta: string }) => void) =>
        listeners.push(listener),
      finalResponse: async () => {
        for (const delta of deltas) listeners.forEach((listener) => listener({ delta }));
        if (response instanceof Error) throw response;
        return response;
      },
      abort: vi.fn(),
    };
  });
  const client = { responses: { stream } } as unknown as OpenAiClientLike;
  return { client, stream, bodies, options };
}

describe.each(["openai", "xai"] as const)("%s adapter", (provider) => {
  const send = (client: OpenAiClientLike, extra: object = {}) =>
    requestAiEdit({ provider, apiKey: "test-key", model: "m", request, createClient: () => client, ...extra });

  it("sends one streamed Responses API call with the strict JSON schema and returns the three fields", async () => {
    const { client, stream, bodies } = clientReturning(
      textResponse({ revisedSource: `${SOURCE}\n`, summary: "Added a reply.", questions: [] }),
    );
    const createClient = vi.fn(() => client);
    const proposal = await requestAiEdit({
      provider,
      apiKey: "test-key",
      model: "gpt-6.2-sol",
      request,
      createClient,
    });
    expect(createClient).toHaveBeenCalledWith("test-key");
    expect(stream).toHaveBeenCalledTimes(1);
    const body = bodies[0]!;
    expect(body.model).toBe("gpt-6.2-sol");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, name: expect.any(String) });
    expect(body.instructions).toContain("You edit PlantUML diagram source");
    expect(body.input).toContain("[[[SELECTION_START]]]");
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect(proposal).toEqual({
      revisedSource: `${SOURCE}\n`,
      summary: "Added a reply.",
      questions: [],
      // Input tokens exclude the cached ones so the app counts each token once.
      usage: { inputTokens: 120, outputTokens: 90, cacheReadTokens: 100, cacheWriteTokens: 0 },
      model: "gpt-6.2-sol-2026-11-01",
    });
  });

  it("reports drafting progress and passes the abort signal to the SDK", async () => {
    const { client, options } = clientReturning(textResponse({ revisedSource: SOURCE, summary: "s", questions: [] }), [
      "ab",
      "cde",
    ]);
    const onProgress = vi.fn();
    const controller = new AbortController();
    await send(client, { onProgress, signal: controller.signal });
    expect(onProgress).toHaveBeenLastCalledWith({ phase: "drafting", receivedCharacters: 5 });
    expect(options[0]?.signal).toBe(controller.signal);
  });

  it("returns questions without a document when the model asks", async () => {
    const { client } = clientReturning(textResponse({ revisedSource: "", summary: "", questions: ["Which?"] }));
    expect(await send(client)).toMatchObject({ revisedSource: "", questions: ["Which?"] });
  });

  it("explains a refusal and never reads its text as a document", async () => {
    const { client } = clientReturning({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }],
    });
    const error = (await send(client).catch((caught: AiEditError) => caught)) as AiEditError;
    expect(error).toMatchObject({ code: "refused" });
    expect(error.message).toContain("declined this request: I can't help with that.");
    expect(error.message).toContain("Nothing was changed");
  });

  it("maps a max-output stop to the too-long message and a content filter to a refusal", async () => {
    const truncated = clientReturning({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "message", content: [{ type: "output_text", text: '{"revised' }] }],
    });
    await expect(send(truncated.client)).rejects.toMatchObject({
      code: "truncated",
      message: expect.stringContaining("fewer lines"),
    });
    const filtered = clientReturning({ status: "incomplete", incomplete_details: { reason: "content_filter" } });
    await expect(send(filtered.client)).rejects.toMatchObject({ code: "refused" });
  });

  it("turns a failed response into a plain message without echoing the raw error", async () => {
    const failed = clientReturning({ status: "failed", error: { code: "server_error", message: "boom sk-secret" } });
    const error = (await send(failed.client).catch((caught: AiEditError) => caught)) as AiEditError;
    expect(error).toMatchObject({ code: "server" });
    expect(error.message).not.toContain("sk-secret");
    const limited = clientReturning({ status: "failed", error: { code: "rate_limit_exceeded", message: "slow" } });
    await expect(send(limited.client)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("rejects answers that do not match the contract", async () => {
    await expect(send(clientReturning(textResponse({ revisedSource: 1 })).client)).rejects.toMatchObject({
      code: "bad_response",
    });
    await expect(send(clientReturning({ status: "completed", output: [] }).client)).rejects.toMatchObject({
      code: "bad_response",
      message: expect.stringContaining("empty"),
    });
  });

  it("maps HTTP and network errors to plain messages", async () => {
    const failing = (status: number | undefined, message = "boom sk-secret", name = "Error") =>
      clientReturning(Object.assign(new Error(message), { status, name }));
    const cases: Array<[number | undefined, string, string?, string?]> = [
      [401, "bad_key"],
      [400, "bad_key", "Incorrect API key provided: sk-secret"],
      [403, "forbidden"],
      [404, "invalid_request"],
      [429, "rate_limited"],
      [429, "invalid_request", "You exceeded your current quota"],
      [500, "server"],
      [undefined, "network", "Connection error.", "APIConnectionError"],
    ];
    for (const [status, code, message, name] of cases) {
      const { client } = failing(status, message, name);
      const error = (await send(client).catch((caught: AiEditError) => caught)) as AiEditError;
      expect(error, `${status} ${message}`).toMatchObject({ code });
      expect(error.message).not.toContain("sk-secret");
    }
  });

  it("names the provider's own console in a credits message", async () => {
    const { client } = clientReturning(Object.assign(new Error("insufficient quota"), { status: 429 }));
    const error = (await send(client).catch((caught: AiEditError) => caught)) as AiEditError;
    expect(error.message).toContain(provider === "openai" ? "OpenAI platform" : "xAI console");
  });

  it("cancels through AbortController and stops the SDK stream", async () => {
    const controller = new AbortController();
    const abort = vi.fn();
    const stream = vi.fn(() => ({
      on: vi.fn(),
      abort,
      finalResponse: () =>
        new Promise<OpenAiResponseLike>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
        }),
    }));
    const client = { responses: { stream } } as unknown as OpenAiClientLike;
    const pending = send(client, { signal: controller.signal });
    await vi.waitFor(() => expect(stream).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(abort).toHaveBeenCalled();
  });

  it("does not create a client without a key or when already cancelled", async () => {
    const createClient = vi.fn();
    await expect(
      requestAiEdit({ provider, apiKey: undefined, model: "m", request, createClient }),
    ).rejects.toMatchObject({ code: "no_key" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestAiEdit({ provider, apiKey: "k", model: "m", request, signal: controller.signal, createClient }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("readOpenAiResponse", () => {
  it("reports cache reads and writes separately from fresh input", () => {
    const reading = readOpenAiResponse(
      textResponse(
        { revisedSource: "", summary: "", questions: [] },
        {
          usage: {
            input_tokens: 500,
            output_tokens: 10,
            input_tokens_details: { cached_tokens: 300, cache_write_tokens: 50 },
          },
        },
      ),
    );
    expect(reading.usage).toEqual({ inputTokens: 150, outputTokens: 10, cacheReadTokens: 300, cacheWriteTokens: 50 });
    expect(reading.stopReason).toBe("finished");
  });

  it("treats missing usage as zero and a cancelled response as cancelled", () => {
    expect(readOpenAiResponse({ status: "cancelled" })).toMatchObject({
      stopReason: "cancelled",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });
});

describe("request body", () => {
  it("is deterministic so the provider's automatic prompt cache can reuse the shared prefix", () => {
    const first = buildOpenAiBody(buildProviderRequest(request), "gpt-6.2-sol");
    const second = buildOpenAiBody(buildProviderRequest({ ...request, instruction: "Other" }), "gpt-6.2-sol");
    expect(first.instructions).toBe(second.instructions);
    expect(first.input).not.toBe(second.input);
  });

  it("leaves room for reasoning tokens and stays within the cap", () => {
    const small = buildOpenAiBody(buildProviderRequest(request), "m");
    expect(small.max_output_tokens).toBeGreaterThan(buildProviderRequest(request).maxOutputTokens);
    const huge = buildOpenAiBody({ ...buildProviderRequest(request), maxOutputTokens: 32000 }, "m");
    expect(huge.max_output_tokens).toBeLessThanOrEqual(48000);
  });

  it("is the same shape for OpenAI and xAI and the key is never part of it", () => {
    expect(buildProviderBody("openai", request, "gpt-6.2-sol")).toEqual(
      buildProviderBody("xai", request, "gpt-6.2-sol"),
    );
    expect(JSON.stringify(buildProviderBody("xai", request, "grok-4.7"))).not.toMatch(/api[_-]?key|Bearer/i);
  });

  it("uses only JSON Schema features both providers accept (no tuple items, no contains bounds)", () => {
    const schema = JSON.stringify(buildProviderRequest(request).schema);
    expect(schema).not.toMatch(/minContains|maxContains|prefixItems/);
    const parsed = buildProviderRequest(request).schema as { properties: { questions: { items: unknown } } };
    expect(Array.isArray(parsed.properties.questions.items)).toBe(false);
  });
});
