import { DOCUMENT_LIMITS, DocumentFormatError } from "./types";

export interface PayloadLimits {
  maxInputBytes: number;
  maxOutputBytes: number;
}

const documentPayloadLimits: PayloadLimits = {
  maxInputBytes: DOCUMENT_LIMITS.maxDecompressedBytes,
  maxOutputBytes: DOCUMENT_LIMITS.maxFileBytes,
};

function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
}

async function collect(stream: ReadableStream<Uint8Array>, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      cancelled(signal);
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new DocumentFormatError("limit-exceeded", "Compression output exceeds the document limit");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function compressPayload(
  bytes: Uint8Array,
  algorithm: "gzip" | "none",
  signal?: AbortSignal,
  limits = documentPayloadLimits,
): Promise<Uint8Array> {
  cancelled(signal);
  if (bytes.byteLength > limits.maxInputBytes)
    throw new DocumentFormatError("limit-exceeded", "Payload exceeds the decompressed document limit");
  if (algorithm === "none") return Uint8Array.from(bytes);
  const input = new Blob([Uint8Array.from(bytes).buffer]).stream().pipeThrough(new CompressionStream("gzip"));
  return collect(input, limits.maxOutputBytes, signal);
}

export async function decompressPayload(
  bytes: Uint8Array,
  algorithm: "gzip" | "none",
  signal?: AbortSignal,
  limits = documentPayloadLimits,
): Promise<Uint8Array> {
  cancelled(signal);
  if (bytes.byteLength > limits.maxInputBytes)
    throw new DocumentFormatError("limit-exceeded", "Document exceeds the file limit");
  if (algorithm === "none") return Uint8Array.from(bytes);
  try {
    const input = new Blob([Uint8Array.from(bytes).buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await collect(input, limits.maxOutputBytes, signal);
  } catch (error) {
    if (error instanceof DocumentFormatError || (error instanceof DOMException && error.name === "AbortError"))
      throw error;
    throw new DocumentFormatError("invalid-file", "Invalid gzip payload");
  }
}
