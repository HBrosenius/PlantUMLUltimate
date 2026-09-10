import { describe, expect, it } from "vitest";
import { DocumentFormatClient } from "./format-client";

class FakeWorker {
  messages: unknown[] = [];
  listener: ((event: MessageEvent<any>) => void) | undefined;
  postMessage(message: unknown): void {
    this.messages.push(message);
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<any>) => void): void {
    this.listener = listener;
  }
  removeEventListener(): void {
    this.listener = undefined;
  }
}

describe("DocumentFormatClient", () => {
  it("matches responses by ID and ignores stale responses after cancellation", async () => {
    const worker = new FakeWorker();
    const client = new DocumentFormatClient(worker);
    const controller = new AbortController();
    const promise = client.decode(new Uint8Array([1]), {}, controller.signal);
    const id = (worker.messages[0] as { id: number }).id;
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    worker.listener?.({ data: { id, ok: true, value: {} } } as MessageEvent);
    expect(worker.messages).toContainEqual({ id, operation: "cancel" });
    client.dispose();
  });
});
