import { describe, expect, it, vi } from "vitest";
import { AiEditError, mapAiError } from "./errors";
import {
  buildStreamBody,
  readFinalMessage,
  requestAiEdit,
  SERVER_SIDE_FALLBACK_BETA,
  type AiClientLike,
  type AiMessageLike,
  type AiStreamBody,
} from "./provider";
import type { AiEditRequest } from "./prompt";

const SOURCE = "@startuml\nA -> B : hello\n@enduml";
const request: AiEditRequest = {
  kind: "sequence",
  source: SOURCE,
  selection: { startLine: 2, endLine: 2 },
  instruction: "Add a reply",
};

const answer = (value: object): AiMessageLike => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  stop_reason: "end_turn",
  model: "claude-opus-5-5",
  usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
});

function clientReturning(message: AiMessageLike | Error, deltas: string[] = []) {
  const bodies: AiStreamBody[] = [];
  const stream = vi.fn((body: AiStreamBody) => {
    bodies.push(body);
    const listeners: Array<(delta: string, snapshot: string) => void> = [];
    return {
      on: (_event: "text", listener: (delta: string, snapshot: string) => void) => listeners.push(listener),
      finalMessage: async () => {
        for (const delta of deltas) listeners.forEach((listener) => listener(delta, delta));
        if (message instanceof Error) throw message;
        return message;
      },
      abort: vi.fn(),
    };
  });
  const client = { beta: { messages: { stream } } } as unknown as AiClientLike;
  return { client, stream, bodies };
}

describe("requestAiEdit", () => {
  it("sends one streamed request with the schema, cached system prompt and server-side fallback", async () => {
    const { client, stream, bodies } = clientReturning(
      answer({ revisedSource: `${SOURCE}\n`, summary: "Added a reply.", questions: [] }),
    );
    const createClient = vi.fn(async () => client);
    const proposal = await requestAiEdit({
      apiKey: "sk-ant-test-key",
      model: "claude-sonnet-5-5",
      request,
      createClient,
    });
    expect(createClient).toHaveBeenCalledWith("sk-ant-test-key");
    expect(stream).toHaveBeenCalledTimes(1);
    const body = bodies[0]!;
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual([SERVER_SIDE_FALLBACK_BETA]);
    expect(body.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.messages[0]!.content).toContain("[[[SELECTION_START]]]");
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-key");
    expect(proposal).toMatchObject({
      summary: "Added a reply.",
      questions: [],
      usage: { inputTokens: 120, outputTokens: 40, cacheReadTokens: 100, cacheWriteTokens: 0 },
    });
  });

  it("reports drafting progress while streaming and resolves only with the final message", async () => {
    const { client } = clientReturning(answer({ revisedSource: SOURCE, summary: "s", questions: [] }), ["ab", "cde"]);
    const onProgress = vi.fn();
    await requestAiEdit({ apiKey: "k", model: "m", request, onProgress, createClient: () => client });
    expect(onProgress).toHaveBeenLastCalledWith({ phase: "drafting", receivedCharacters: 5 });
  });

  it("returns questions without a document when the model asks", async () => {
    const { client } = clientReturning(
      answer({ revisedSource: "", summary: "", questions: ["Which service times out?"] }),
    );
    const proposal = await requestAiEdit({ apiKey: "k", model: "m", request, createClient: () => client });
    expect(proposal.questions).toEqual(["Which service times out?"]);
    expect(proposal.revisedSource).toBe("");
  });

  it("refuses without a key, and for oversized or empty requests, before creating a client", async () => {
    const createClient = vi.fn();
    await expect(requestAiEdit({ apiKey: undefined, model: "m", request, createClient })).rejects.toMatchObject({
      code: "no_key",
    });
    await expect(
      requestAiEdit({ apiKey: "k", model: "m", request: { ...request, source: "x".repeat(101 * 1024) }, createClient }),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      requestAiEdit({ apiKey: "k", model: "m", request: { ...request, instruction: "  " }, createClient }),
    ).rejects.toBeInstanceOf(AiEditError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps a refusal and a truncated answer to plain messages before reading content", async () => {
    const refused = clientReturning({
      content: [{ type: "text", text: "not json" }],
      stop_reason: "refusal",
      stop_details: { explanation: "Policy." },
    });
    await expect(
      requestAiEdit({ apiKey: "k", model: "m", request, createClient: () => refused.client }),
    ).rejects.toMatchObject({ code: "refused", message: expect.stringContaining("Nothing was changed") });
    const truncated = clientReturning({ content: [{ type: "text", text: '{"revised' }], stop_reason: "max_tokens" });
    await expect(
      requestAiEdit({ apiKey: "k", model: "m", request, createClient: () => truncated.client }),
    ).rejects.toMatchObject({ code: "truncated", message: expect.stringContaining("fewer lines") });
  });

  it("rejects answers that do not match the contract", async () => {
    expect(() => readFinalMessage({ content: [{ type: "text", text: "nope" }], stop_reason: "end_turn" }, "m")).toThrow(
      /expected format/,
    );
    expect(() =>
      readFinalMessage({ content: [{ type: "text", text: '{"revisedSource":1}' }], stop_reason: "end_turn" }, "m"),
    ).toThrow(/expected format/);
    expect(() => readFinalMessage({ content: [], stop_reason: "end_turn" }, "m")).toThrow(/empty/);
  });

  it("ignores non-text blocks such as a fallback marker", () => {
    const message: AiMessageLike = {
      content: [
        { type: "fallback" },
        { type: "text", text: JSON.stringify({ revisedSource: SOURCE, summary: "s", questions: [] }) },
      ],
      stop_reason: "end_turn",
    };
    expect(readFinalMessage(message, "m").revisedSource).toBe(SOURCE);
  });

  it("cancels through AbortController", async () => {
    const controller = new AbortController();
    let aborted = false;
    const stream = vi.fn(() => ({
      on: vi.fn(),
      abort: () => {
        aborted = true;
      },
      finalMessage: () =>
        new Promise<AiMessageLike>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
        }),
    }));
    const client = { beta: { messages: { stream } } } as unknown as AiClientLike;
    const pending = requestAiEdit({
      apiKey: "k",
      model: "m",
      request,
      signal: controller.signal,
      createClient: () => client,
    });
    await vi.waitFor(() => expect(stream).toHaveBeenCalled());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(aborted).toBe(true);
  });

  it("does not start when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const createClient = vi.fn();
    await expect(
      requestAiEdit({ apiKey: "k", model: "m", request, signal: controller.signal, createClient }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("turns SDK failures into plain messages without echoing the raw error", async () => {
    const failing = (status: number | undefined, message = "boom sk-ant-secret") =>
      clientReturning(Object.assign(new Error(message), { status }));
    const cases: Array<[number | undefined, string]> = [
      [401, "bad_key"],
      [403, "forbidden"],
      [429, "rate_limited"],
      [529, "overloaded"],
      [500, "server"],
      [400, "invalid_request"],
    ];
    for (const [status, code] of cases) {
      const { client } = failing(status);
      const error = await requestAiEdit({ apiKey: "k", model: "m", request, createClient: () => client }).catch(
        (caught: AiEditError) => caught,
      );
      expect(error).toMatchObject({ code });
      expect((error as AiEditError).message).not.toContain("sk-ant-secret");
    }
  });
});

describe("mapAiError", () => {
  it("recognises connection errors and unknown failures", () => {
    expect(mapAiError(Object.assign(new Error("Connection error."), { name: "APIConnectionError" })).code).toBe(
      "network",
    );
    expect(mapAiError(new TypeError("Failed to fetch")).code).toBe("network");
    expect(mapAiError(new Error("weird")).code).toBe("unknown");
    expect(mapAiError(Object.assign(new Error("Your credit balance is too low"), { status: 400 })).message).toContain(
      "no credits",
    );
  });
});

describe("buildStreamBody", () => {
  it("is deterministic so the cached system prompt is reused across requests", () => {
    const first = buildStreamBody(request, "claude-opus-5-5");
    const second = buildStreamBody({ ...request, instruction: "Something else" }, "claude-opus-5-5");
    expect(first.system).toEqual(second.system);
    expect(first.messages).not.toEqual(second.messages);
  });
});
