import { decompressPayload } from "./compression";
import { hashSource, reconstructContents } from "./content-codec";
import { decodeEnvelope } from "./envelope";
import { decryptPayload, unlockHeader, type UnlockedDocumentKey } from "./encryption";
import { DocumentFormatError, type PortableDocument } from "./types";
import { validateDocument } from "./validate";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

export interface DecodeDocumentOptions { password?: string; unlockedKey?: UnlockedDocumentKey; signal?: AbortSignal }
export interface DecodedDocument {
  document: PortableDocument;
  contents: Map<string, string>;
  compression: "gzip" | "none";
  unlockedKey?: UnlockedDocumentKey;
}

export async function decodeDocument(bytes: Uint8Array, options: DecodeDocumentOptions = {}): Promise<DecodedDocument> {
  const envelope = decodeEnvelope(bytes);
  let compressed = envelope.payload;
  let unlockedKey = options.unlockedKey;
  if (envelope.header.encryption === "aes-256-gcm") {
    if (!unlockedKey && options.password === undefined)
      throw new DocumentFormatError("password-required", "This document requires a password");
    unlockedKey ??= await unlockHeader(options.password!, envelope.header);
    compressed = await decryptPayload(compressed, unlockedKey, envelope.header, envelope.authenticatedData);
  }
  const payload = await decompressPayload(compressed, envelope.header.compression, options.signal);
  let parsed: unknown;
  try { parsed = JSON.parse(UTF8.decode(payload)); }
  catch { throw new DocumentFormatError("invalid-file", "Document payload is not strict UTF-8 JSON"); }
  const document = validateDocument(parsed);
  if ((await hashSource(document.current.source)) !== document.current.sourceHash)
    throw new DocumentFormatError("invalid-file", "Current source hash does not match");
  const contents = await reconstructContents(document.contents);
  return { document, contents, compression: envelope.header.compression, ...(unlockedKey ? { unlockedKey } : {}) };
}
