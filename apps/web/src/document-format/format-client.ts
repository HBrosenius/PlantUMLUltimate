import type {
  DecodeDocumentOptions,
  DecodedDocument,
  EncodeDocumentOptions,
  EncodedDocument,
  PortableDocument,
} from "@plantuml-studio/document-format";

interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<WorkerResponse>) => void): void;
  terminate?(): void;
}

type WorkerRequest =
  | { id: number; operation: "encode"; document: PortableDocument; options: Omit<EncodeDocumentOptions, "signal" | "randomBytes"> }
  | { id: number; operation: "decode"; bytes: Uint8Array; options: Omit<DecodeDocumentOptions, "signal"> }
  | { id: number; operation: "cancel" };
type OperationRequest =
  | { operation: "encode"; document: PortableDocument; options: Omit<EncodeDocumentOptions, "signal" | "randomBytes"> }
  | { operation: "decode"; bytes: Uint8Array; options: Omit<DecodeDocumentOptions, "signal"> };
type WorkerResponse =
  | { id: number; ok: true; value: EncodedDocument | DecodedDocument }
  | { id: number; ok: false; error: { name: string; message: string; code?: string } };

export class DocumentFormatClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void }>();
  private readonly onMessage = (event: MessageEvent<WorkerResponse>) => {
    const pending = this.pending.get(event.data.id);
    if (!pending) return;
    this.pending.delete(event.data.id);
    if (event.data.ok) pending.resolve(event.data.value);
    else pending.reject(Object.assign(new Error(event.data.error.message), event.data.error));
  };

  constructor(private readonly worker: WorkerLike = new Worker(new URL("./document-format.worker.ts", import.meta.url), { type: "module" })) {
    worker.addEventListener("message", this.onMessage);
  }

  private request<T>(message: OperationRequest, signal?: AbortSignal, transfer?: Transferable[]): Promise<T> {
    const id = this.nextId++;
    if (signal?.aborted) return Promise.reject(new DOMException("Operation cancelled", "AbortError"));
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        this.worker.postMessage({ id, operation: "cancel" } satisfies WorkerRequest);
        reject(new DOMException("Operation cancelled", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        resolve: (value) => { signal?.removeEventListener("abort", abort); resolve(value as T); },
        reject: (error) => { signal?.removeEventListener("abort", abort); reject(error); },
      });
      this.worker.postMessage({ ...message, id } as WorkerRequest, transfer);
    });
  }

  encode(document: PortableDocument, options: Omit<EncodeDocumentOptions, "signal" | "randomBytes"> = {}, signal?: AbortSignal) {
    return this.request<EncodedDocument>({ operation: "encode", document, options }, signal);
  }

  decode(bytes: Uint8Array, options: Omit<DecodeDocumentOptions, "signal"> = {}, signal?: AbortSignal) {
    const transferable = Uint8Array.from(bytes);
    return this.request<DecodedDocument>({ operation: "decode", bytes: transferable, options }, signal, [transferable.buffer]);
  }

  dispose(): void {
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.terminate?.();
    for (const pending of this.pending.values()) pending.reject(new DOMException("Client disposed", "AbortError"));
    this.pending.clear();
  }
}
