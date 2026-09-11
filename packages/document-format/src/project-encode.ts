import { compressPayload, type PayloadLimits } from "./compression";
import { encodeEnvelope } from "./envelope";
import {
  deriveDocumentKey,
  encryptedHeader,
  encryptPayload,
  secureRandomBytes,
  type RandomBytes,
  type UnlockedDocumentKey,
} from "./encryption";
import { DOCUMENT_LIMITS, type EnvelopeHeader, type PortableProject } from "./types";
import { validateProject } from "./validate";

const UTF8 = new TextEncoder();
const projectPayloadLimits: PayloadLimits = {
  maxInputBytes: DOCUMENT_LIMITS.maxProjectFileBytes,
  maxOutputBytes: DOCUMENT_LIMITS.maxProjectFileBytes,
};

export interface EncodeProjectOptions {
  compression?: "gzip" | "none";
  password?: string;
  unlockedKey?: UnlockedDocumentKey;
  randomBytes?: RandomBytes;
  signal?: AbortSignal;
}

export interface EncodedProject {
  bytes: Uint8Array;
  unlockedKey?: UnlockedDocumentKey;
}

export async function encodeProject(
  project: PortableProject,
  options: EncodeProjectOptions = {},
): Promise<EncodedProject> {
  const checked = validateProject(project);
  const compression = options.compression ?? "gzip";
  const compressed = await compressPayload(
    UTF8.encode(JSON.stringify(checked)),
    compression,
    options.signal,
    projectPayloadLimits,
  );
  if (!options.password && !options.unlockedKey) {
    const header: EnvelopeHeader = { compression, encryption: "none" };
    return { bytes: encodeEnvelope(header, compressed, 2) };
  }
  const random = options.randomBytes ?? secureRandomBytes;
  const unlockedKey = options.unlockedKey ?? (await deriveDocumentKey(options.password!, random(16)));
  const iv = random(12);
  const header = encryptedHeader(compression, unlockedKey, iv);
  const authenticatedData = encodeEnvelope(header, new Uint8Array(), 2);
  const encrypted = await encryptPayload(compressed, unlockedKey, iv, authenticatedData);
  return { bytes: encodeEnvelope(header, encrypted, 2), unlockedKey };
}
