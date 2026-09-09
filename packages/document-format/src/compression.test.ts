import { describe, expect, it } from "vitest";
import { compressPayload, decompressPayload } from "./index";

describe("compression adapters", () => {
  it.each(["none", "gzip"] as const)("round-trips %s payloads", async (algorithm) => {
    const source = new TextEncoder().encode("offline → portable\r\n".repeat(200));
    await expect(decompressPayload(await compressPayload(source, algorithm), algorithm)).resolves.toEqual(source);
  });

  it("rejects malformed gzip and cancellation separately", async () => {
    await expect(decompressPayload(new Uint8Array([1, 2, 3]), "gzip")).rejects.toMatchObject({ code: "invalid-file" });
    const controller = new AbortController();
    controller.abort();
    await expect(compressPayload(new Uint8Array(), "gzip", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
