/// <reference lib="webworker" />
import { decodeDocument, encodeDocument } from "@plantuml-studio/document-format";

const controllers = new Map<number, AbortController>();

self.addEventListener("message", (event: MessageEvent<Record<string, unknown>>) => {
  const request = event.data;
  const id = request.id as number;
  if (request.operation === "cancel") {
    controllers.get(id)?.abort();
    controllers.delete(id);
    return;
  }
  const controller = new AbortController();
  controllers.set(id, controller);
  const operation =
    request.operation === "encode"
      ? encodeDocument(request.document as Parameters<typeof encodeDocument>[0], {
          ...(request.options as Parameters<typeof encodeDocument>[1]),
          signal: controller.signal,
        })
      : decodeDocument(request.bytes as Uint8Array, {
          ...(request.options as Parameters<typeof decodeDocument>[1]),
          signal: controller.signal,
        });
  void operation.then(
    (value) => {
      if (!controllers.delete(id)) return;
      self.postMessage({ id, ok: true, value });
    },
    (error: unknown) => {
      if (!controllers.delete(id)) return;
      const failure = error instanceof Error ? error : new Error("Document codec failed");
      self.postMessage({
        id,
        ok: false,
        error: { name: failure.name, message: failure.message, ...("code" in failure ? { code: failure.code } : {}) },
      });
    },
  );
});
