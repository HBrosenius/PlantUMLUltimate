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
  it.each(["none", "gzip"] as const)("round-trips unencrypted %s", async (compression) => {
    const input = await document();
    const encoded = await encodeDocument(input, { compression });
    expect((await decodeDocument(encoded.bytes)).document).toEqual(input);
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
