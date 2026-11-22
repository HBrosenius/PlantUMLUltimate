import { describe, expect, it } from "vitest";
import {
  AI_MODELS,
  DEFAULT_AI_MODELS,
  estimateCostUsd,
  hasPrice,
  isKnownAiModel,
  isValidModelId,
  modelsFor,
} from "./models";
import { AI_PROVIDER_IDS } from "./providers";

const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("model list and price table", () => {
  it("lists the models of every provider and a default that is in the list", () => {
    for (const provider of AI_PROVIDER_IDS) {
      expect(modelsFor(provider).length).toBeGreaterThan(0);
      expect(isKnownAiModel(DEFAULT_AI_MODELS[provider], provider)).toBe(true);
    }
    expect(modelsFor("openai").map((model) => model.id)).toEqual(["gpt-6.2-astra", "gpt-6.2-sol", "gpt-6-luna"]);
    expect(modelsFor("xai").map((model) => model.id)).toEqual(["grok-4.7", "grok-4.3"]);
    expect(new Set(AI_MODELS.map((model) => model.id)).size).toBe(AI_MODELS.length);
  });

  it("prices a million input plus a million output tokens per model", () => {
    const cost = (id: string) => estimateCostUsd(id, usage);
    expect(cost("claude-opus-5-5")).toBeCloseTo(24);
    expect(cost("gpt-6.2-astra")).toBeCloseTo(48);
    expect(cost("gpt-6.2-sol")).toBeCloseTo(12);
    expect(cost("gpt-6-luna")).toBeCloseTo(0.6);
    expect(cost("grok-4.7")).toBeCloseTo(8);
    expect(cost("grok-4.3")).toBeCloseTo(3.75);
  });

  it("applies each provider's cache multipliers to the input price", () => {
    const cached = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
    expect(estimateCostUsd("claude-opus-5-5", cached)).toBeCloseTo(4 * 0.1 + 4 * 1.25);
    expect(estimateCostUsd("gpt-6.2-sol", cached)).toBeCloseTo(2 * 0.1 + 2);
  });

  it("has no price for an unknown or custom model, so only tokens can be shown", () => {
    expect(hasPrice("gpt-7-imaginary")).toBe(false);
    expect(estimateCostUsd("gpt-7-imaginary", usage)).toBe(0);
    expect(hasPrice("grok-4.7")).toBe(true);
  });

  it("accepts custom ids that are safe to put in a request and rejects the rest", () => {
    expect(isValidModelId("ft:gpt-6.2-sol:acme::abc123")).toBe(true);
    expect(isValidModelId("org/model-1.5")).toBe(true);
    for (const bad of ["", " ", "has space", "<script>", "a".repeat(101), "-leading", 5, undefined])
      expect(isValidModelId(bad)).toBe(false);
  });
});
