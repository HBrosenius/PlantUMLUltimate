import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { deflateRaw } from "./deflate";

function lcg(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  };
}

describe("deflateRaw", () => {
  it("round trips through a real inflate", () => {
    const random = lcg(7);
    const cases: Record<string, Uint8Array> = {
      empty: new Uint8Array(0),
      one: Uint8Array.of(42),
      two: Uint8Array.of(1, 2),
      zeros: new Uint8Array(100_000),
      noise: Uint8Array.from({ length: 5_000 }, random),
      ramp: Uint8Array.from({ length: 70_000 }, (_, i) => i & 0xff),
      text: new TextEncoder().encode("sprite ".repeat(3_000) + "end"),
      // Matches that reach back across the whole 32 KiB window.
      far: (() => {
        const block = Uint8Array.from({ length: 32_000 }, random);
        const data = new Uint8Array(block.length * 3);
        for (let i = 0; i < 3; i++) data.set(block, i * block.length);
        return data;
      })(),
      // Matches of length 258 and their neighbours.
      runs: Uint8Array.from({ length: 4_000 }, (_, i) => (Math.floor(i / 259) % 2 ? 9 : 200)),
    };
    for (const [name, data] of Object.entries(cases))
      expect([name, [...inflateRawSync(deflateRaw(data))]], name).toEqual([name, [...data]]);
  });

  it("is deterministic and compresses repetitive data", () => {
    const data = Uint8Array.from({ length: 9_000 }, (_, i) => (i % 48 < 24 ? 0 : (i * 7) % 5));
    const first = deflateRaw(data);
    expect([...deflateRaw(data.slice())]).toEqual([...first]);
    expect(first.length).toBeLessThan(data.length / 4);
  });

  it("never grows incompressible data by more than the fixed code's overhead", () => {
    const random = lcg(99);
    const data = Uint8Array.from({ length: 10_000 }, random);
    expect(deflateRaw(data).length).toBeLessThan(data.length * 1.15);
  });
});
