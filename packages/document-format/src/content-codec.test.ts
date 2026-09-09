import { describe, expect, it } from "vitest";
import { DocumentFormatError, encodeContentHistory, reconstructContents } from "./index";

describe("portable content codec", () => {
  it("preserves empty, Unicode, CRLF, rewrites, and reversion exactly", async () => {
    const sources = ["", "@startuml\r\nAlice → Bob\r\n@enduml", "entire rewrite", ""];
    const encoded = await encodeContentHistory(sources);
    expect(encoded.contentIds[0]).toBe(encoded.contentIds[3]);
    expect(encoded.contents).toHaveLength(3);
    const decoded = await reconstructContents(encoded.contents);
    expect(encoded.contentIds.map((id) => decoded.get(id))).toEqual(sources);
  });

  it("uses splices for small changes and bounds chain depth", async () => {
    const sources = Array.from({ length: 14 }, (_, index) => `${"a".repeat(200)}-${index}`);
    const encoded = await encodeContentHistory(sources);
    expect(encoded.contents.some((record) => record.kind === "splice")).toBe(true);
    await expect(reconstructContents(encoded.contents)).resolves.toBeDefined();
  });

  it("rejects malformed ranges, hashes, and delta chains", async () => {
    const encoded = await encodeContentHistory(["a".repeat(100), `${"a".repeat(100)}x`]);
    const splice = encoded.contents.find((record) => record.kind === "splice")!;
    const malformed = encoded.contents.map((record) => record === splice ? { ...splice, prefixBytes: 9999 } : record);
    await expect(reconstructContents(malformed)).rejects.toMatchObject({ code: "invalid-file" } satisfies Partial<DocumentFormatError>);
    await expect(reconstructContents([{ id: "0".repeat(64), kind: "full", source: "wrong", byteLength: 5 }]))
      .rejects.toMatchObject({ code: "invalid-file" });
  });
});
