// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { AiEditError } from "./errors";
import { instructionWithAnswers, runAiEdit } from "./ai-edit-session";
import type { AiEditProposal, RequestAiEditOptions } from "./provider";

const ORIGINAL = ["@startuml", "participant A", "participant B", "A -> B : save", "B --> A : saved", "@enduml"].join(
  "\n",
);
const GOOD = ORIGINAL.replace(
  "A -> B : save\nB --> A : saved",
  "alt ok\nA -> B : save\nB --> A : saved\nelse timeout\nB --> A : timeout\nend",
);
const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 };
const proposal = (revisedSource: string, questions: string[] = []): AiEditProposal => ({
  revisedSource,
  summary: "Did it.",
  questions,
  usage,
  model: "claude-opus-5-5",
});
const request = {
  kind: "sequence" as const,
  source: ORIGINAL,
  selection: { startLine: 4, endLine: 5 },
  instruction: "Add a timeout path",
};

function run(send: (options: RequestAiEditOptions) => Promise<AiEditProposal>, current = ORIGINAL) {
  const phases: string[] = [];
  return {
    phases,
    done: runAiEdit({
      request,
      apiKey: "k",
      model: "claude-opus-5-5",
      getCurrentSource: () => current,
      onPhase: (phase) => phases.push(phase),
      send,
    }),
  };
}

describe("runAiEdit", () => {
  it("returns a checked proposal", async () => {
    const send = vi.fn(async () => proposal(GOOD));
    const { done, phases } = run(send);
    expect(await done).toMatchObject({ type: "proposal", source: GOOD, retried: false, summary: "Did it." });
    expect(phases).toEqual(["drafting", "checking"]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns questions without checking anything", async () => {
    const outcome = await run(async () => proposal("", ["Which service?"])).done;
    expect(outcome).toMatchObject({ type: "questions", questions: ["Which service?"] });
  });

  it("retries once with the diagnostics fed back, then succeeds", async () => {
    const bodies: Array<readonly string[] | undefined> = [];
    const send = vi.fn(async (options: RequestAiEditOptions) => {
      bodies.push(options.request.previousProblems);
      return proposal(bodies.length === 1 ? GOOD.replace("\nend\n", "\n") : GOOD);
    });
    const { done, phases } = run(send);
    expect(await done).toMatchObject({ type: "proposal", retried: true });
    expect(bodies[0]).toBeUndefined();
    expect(bodies[1]?.length).toBeGreaterThan(0);
    expect(phases).toEqual(["drafting", "checking", "retrying", "checking"]);
  });

  it("gives up after one retry and adds the usage of both attempts", async () => {
    const send = vi.fn(async () => proposal(ORIGINAL));
    const outcome = await run(send).done;
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      type: "failed",
      code: "unchanged",
      retried: true,
      usage: { inputTokens: 200, outputTokens: 100 },
    });
  });

  it("does not retry a proposal made stale by conflicting edits", async () => {
    const current = ORIGINAL.replace("B --> A : saved", "B --> A : stored");
    const send = vi.fn(async () => proposal(GOOD));
    const outcome = await run(send, current).done;
    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ type: "failed", code: "stale" });
  });

  it("rebases onto edits made while the request ran", async () => {
    const current = ORIGINAL.replace("participant A", "participant A #LightBlue");
    const outcome = await run(async () => proposal(GOOD), current).done;
    expect(outcome).toMatchObject({ type: "proposal", rebased: true });
  });

  it("maps provider errors and cancellation to outcomes without retrying", async () => {
    const refused = vi.fn(async () => {
      throw new AiEditError("refused", "The model declined this request.");
    });
    expect(await run(refused).done).toMatchObject({ type: "failed", code: "refused", message: expect.any(String) });
    expect(refused).toHaveBeenCalledTimes(1);
    const cancelled = vi.fn(async () => {
      throw new AiEditError("cancelled", "Cancelled.");
    });
    expect((await run(cancelled).done).type).toBe("cancelled");
  });
});

describe("instructionWithAnswers", () => {
  it("appends each question with its answer", () => {
    expect(instructionWithAnswers("Add a timeout", ["Which?", "How long?"], ["Payments", ""])).toBe(
      "Add a timeout\n\nAnswers to your questions:\nQ: Which?\nA: Payments\nQ: How long?\nA: (no answer)",
    );
  });
});
