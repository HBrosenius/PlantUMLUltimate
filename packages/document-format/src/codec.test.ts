import { describe, expect, it } from "vitest";
import { decodeDocument, encodeDocument, type PortableDocument, sha256 } from "./index";

async function document(): Promise<PortableDocument> {
  const source = "@startgantt\r\n[Ångström] lasts 2 days\r\n@endgantt";
  const hash = await sha256(new TextEncoder().encode(source));
  return {
    schemaVersion: 1,
    documentId: "11111111-1111-4111-8111-111111111111",
    savedAt: "2026-09-09T12:00:00.000Z",
    current: { source, sourceHash: hash, diagramKind: "gantt" },
    settings: { resourceCapacities: {} },
    historyPolicy: { maxVersions: 100, maxLogicalBytes: 16 * 1024 * 1024 },
    versions: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        contentId: hash,
        createdAt: "2026-09-09T12:00:00.000Z",
        sequence: 0,
        reason: "opened",
        pinned: false,
        diagramKind: "gantt",
      },
    ],
    contents: [{ id: hash, kind: "full", source, byteLength: new TextEncoder().encode(source).length }],
  };
}

describe("composed document codec", () => {
  const scenario = {
    id: "scenario-1",
    name: "Integration buffer",
    assumptions: "Two more days",
    baseSource: "@startgantt\n[Build] lasts 3 days\n@endgantt",
    source: "@startgantt\n[Build] lasts 5 days\n@endgantt",
    capacities: { Alice: 80 },
    updatedAt: "2026-10-12T12:00:00.000Z",
  };
  it.each([false, true])(
    "round-trips saved scenarios inside the document payload (encrypted=%s)",
    async (encrypted) => {
      const input = await document();
      input.settings.deliveryScenarios = [scenario];
      const options = encrypted ? { password: "scenario-password" } : {};
      const encoded = await encodeDocument(input, options);
      const decoded = await decodeDocument(encoded.bytes, options);
      expect(decoded.document.settings.deliveryScenarios).toEqual([scenario]);
    },
  );
  it.each(
    [
      [{ ...scenario, capacities: { Alice: -1 } }],
      [{ ...scenario, source: "not a Gantt diagram" }],
      [{ ...scenario, updatedAt: "invalid" }],
      [scenario, scenario],
      Array.from({ length: 21 }, (_, index) => ({ ...scenario, id: `${index}` })),
    ].map((scenarios) => [scenarios]),
  )("rejects malformed or excessive saved scenarios %#", async (scenarios) => {
    const input = await document();
    input.settings.deliveryScenarios = scenarios;
    await expect(encodeDocument(input)).rejects.toThrow();
  });
  it.each(["none", "gzip"] as const)("round-trips unencrypted %s", async (compression) => {
    const input = await document();
    const encoded = await encodeDocument(input, { compression });
    expect((await decodeDocument(encoded.bytes)).document).toEqual(input);
  });

  it("rejects an impossible saved forecast date", async () => {
    const input = await document();
    input.settings.progressForecast = { enabled: true, asOf: "2026-02-30", remainingDays: {} };
    await expect(encodeDocument(input)).rejects.toThrow("settings.progressForecast.asOf must be a valid ISO date");
  });

  it("rejects an invalid saved forecast time zone", async () => {
    const input = await document();
    input.settings.progressForecast = { enabled: true, timeZone: "Made/Up", remainingDays: {} };
    await expect(encodeDocument(input)).rejects.toThrow(
      "settings.progressForecast.timeZone must be a valid IANA time zone",
    );
  });

  it("rejects __proto__ keys that would replace an object prototype when copied", async () => {
    const capacities = await document();
    capacities.settings.resourceCapacities = JSON.parse('{"__proto__": 100}');
    await expect(encodeDocument(capacities)).rejects.toThrow("reserved resource name");
    const forecast = await document();
    forecast.settings.progressForecast = { enabled: true, remainingDays: JSON.parse('{"__proto__": 3}') };
    await expect(encodeDocument(forecast)).rejects.toThrow("reserved task ID");
  });

  it("encrypts deterministically with injected randomness and varies normal saves", async () => {
    const input = await document();
    const deterministic = (length: number) => new Uint8Array(length).fill(length);
    const first = await encodeDocument(input, {
      compression: "none",
      password: "exact password",
      randomBytes: deterministic,
    });
    const second = await encodeDocument(input, {
      compression: "none",
      password: "exact password",
      randomBytes: deterministic,
    });
    expect(first.bytes).toEqual(second.bytes);
    expect((await decodeDocument(first.bytes, { password: "exact password" })).document).toEqual(input);
    const randomA = await encodeDocument(input, { password: "exact password" });
    const randomB = await encodeDocument(input, { password: "exact password" });
    expect(randomA.bytes).not.toEqual(randomB.bytes);
  }, 30_000);

  it("requires a password and authenticates ciphertext", async () => {
    const encoded = await encodeDocument(await document(), { compression: "none", password: "right" });
    await expect(decodeDocument(encoded.bytes)).rejects.toMatchObject({ code: "password-required" });
    await expect(decodeDocument(encoded.bytes, { password: "wrong" })).rejects.toMatchObject({ code: "unlock-failed" });
    const damaged = Uint8Array.from(encoded.bytes);
    damaged[damaged.length - 1] = damaged[damaged.length - 1]! ^ 1;
    await expect(decodeDocument(damaged, { password: "right" })).rejects.toMatchObject({ code: "unlock-failed" });
  }, 30_000);
});

describe("encodeDocument passwords", () => {
  it("rejects an empty password instead of writing an unencrypted file", async () => {
    await expect(encodeDocument(await document(), { password: "" })).rejects.toThrow("A password must not be empty");
  });
});
