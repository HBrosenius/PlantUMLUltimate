import { compressPayload } from "./compression";
import { hashSource, reconstructContents } from "./content-codec";
import { encodeEnvelope } from "./envelope";
import {
  deriveDocumentKey,
  encryptedHeader,
  encryptPayload,
  secureRandomBytes,
  type RandomBytes,
  type UnlockedDocumentKey,
} from "./encryption";
import { DocumentFormatError, type EnvelopeHeader, type PortableDocument } from "./types";
import { validateDocument } from "./validate";

const UTF8 = new TextEncoder();

export interface EncodeDocumentOptions {
  compression?: "gzip" | "none";
  password?: string;
  unlockedKey?: UnlockedDocumentKey;
  randomBytes?: RandomBytes;
  signal?: AbortSignal;
}

export interface EncodedDocument {
  bytes: Uint8Array;
  unlockedKey?: UnlockedDocumentKey;
}

export async function encodeDocument(
  document: PortableDocument,
  options: EncodeDocumentOptions = {},
): Promise<EncodedDocument> {
  const checked = validateDocument(document);
  if ((await hashSource(checked.current.source)) !== checked.current.sourceHash)
    throw new DocumentFormatError("invalid-file", "Current source hash does not match");
  await reconstructContents(checked.contents);
  const compression = options.compression ?? "gzip";
  const compressed = await compressPayload(UTF8.encode(JSON.stringify(checked)), compression, options.signal);
  if (!options.password && !options.unlockedKey) {
    const header: EnvelopeHeader = { compression, encryption: "none" };
    return { bytes: encodeEnvelope(header, compressed) };
  }
  const random = options.randomBytes ?? secureRandomBytes;
  const unlockedKey = options.unlockedKey ?? (await deriveDocumentKey(options.password!, random(16)));
  const iv = random(12);
  const header = encryptedHeader(compression, unlockedKey, iv);
  const authenticatedData = encodeEnvelope(header, new Uint8Array());
  const encrypted = await encryptPayload(compressed, unlockedKey, iv, authenticatedData);
  return { bytes: encodeEnvelope(header, encrypted), unlockedKey };
}
