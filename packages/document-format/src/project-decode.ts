import { decompressPayload, type PayloadLimits } from "./compression";
import { decodeEnvelope } from "./envelope";
import { decryptPayload, unlockHeader, type UnlockedDocumentKey } from "./encryption";
import { DOCUMENT_LIMITS, DocumentFormatError, type PortableProject } from "./types";
import { validateProject } from "./validate";

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const projectPayloadLimits: PayloadLimits = {
  maxInputBytes: DOCUMENT_LIMITS.maxProjectFileBytes,
  maxOutputBytes: DOCUMENT_LIMITS.maxProjectFileBytes,
};

export interface DecodeProjectOptions {
  password?: string;
  unlockedKey?: UnlockedDocumentKey;
  signal?: AbortSignal;
}

export interface DecodedProject {
  project: PortableProject;
  compression: "gzip" | "none";
  unlockedKey?: UnlockedDocumentKey;
}

export async function decodeProject(bytes: Uint8Array, options: DecodeProjectOptions = {}): Promise<DecodedProject> {
  const envelope = decodeEnvelope(bytes);
  if (envelope.version !== 2)
    throw new DocumentFormatError(
      "unsupported-version",
      "This file contains a single document and must be opened as a document",
    );
  let compressed = envelope.payload;
  let unlockedKey = options.unlockedKey;
  if (envelope.header.encryption === "aes-256-gcm") {
    if (!unlockedKey && options.password === undefined)
      throw new DocumentFormatError("password-required", "This project requires a password");
    unlockedKey ??= await unlockHeader(options.password!, envelope.header);
    compressed = await decryptPayload(compressed, unlockedKey, envelope.header, envelope.authenticatedData);
  }
  const payload = await decompressPayload(
    compressed,
    envelope.header.compression,
    options.signal,
    projectPayloadLimits,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(UTF8.decode(payload));
  } catch {
    throw new DocumentFormatError("invalid-file", "Project payload is not strict UTF-8 JSON");
  }
  const project = validateProject(parsed);
  return { project, compression: envelope.header.compression, ...(unlockedKey ? { unlockedKey } : {}) };
}
