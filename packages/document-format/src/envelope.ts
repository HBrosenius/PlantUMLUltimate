import {
  DOCUMENT_LIMITS,
  DOCUMENT_MAGIC,
  ENVELOPE_VERSION,
  PROJECT_ENVELOPE_VERSION,
  DocumentFormatError,
  type DecodedEnvelope,
  type EnvelopeHeader,
} from "./types";

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const PREFIX_BYTES = 13;
const MAGIC_BYTES = UTF8_ENCODER.encode(DOCUMENT_MAGIC);

function invalid(message: string): never {
  throw new DocumentFormatError("invalid-file", message);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) invalid(`Envelope header contains unsupported field ${extra}`);
}

function decodedBase64Bytes(value: unknown, name: string): number {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    invalid(`${name} must be canonical base64`);
  return (value.length / 4) * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
}

export function validateEnvelopeHeader(value: unknown): EnvelopeHeader {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Envelope header must be an object");
  const header = value as Record<string, unknown>;
  if (header.compression !== "gzip" && header.compression !== "none")
    invalid("Envelope compression algorithm is not supported");
  if (header.encryption === "none") {
    exactKeys(header, ["compression", "encryption"]);
    return header as unknown as EnvelopeHeader;
  }
  if (header.encryption !== "aes-256-gcm") invalid("Envelope encryption algorithm is not supported");
  exactKeys(header, ["compression", "encryption", "kdf", "iterations", "salt", "iv", "tagBits"]);
  if (header.kdf !== "pbkdf2-sha256") invalid("Envelope KDF is not supported");
  if (
    !Number.isSafeInteger(header.iterations) ||
    (header.iterations as number) < 600_000 ||
    (header.iterations as number) > 2_000_000
  )
    invalid("Envelope PBKDF2 iterations must be from 600000 to 2000000");
  if (decodedBase64Bytes(header.salt, "Envelope salt") !== 16) invalid("Envelope salt must contain 16 bytes");
  if (decodedBase64Bytes(header.iv, "Envelope IV") !== 12) invalid("Envelope IV must contain 12 bytes");
  if (header.tagBits !== 128) invalid("Envelope authentication tag must be 128 bits");
  return header as unknown as EnvelopeHeader;
}

export function encodeEnvelope(
  header: EnvelopeHeader,
  payload: Uint8Array,
  version: typeof ENVELOPE_VERSION | typeof PROJECT_ENVELOPE_VERSION = ENVELOPE_VERSION,
): Uint8Array {
  const checked = validateEnvelopeHeader(header);
  const headerBytes = UTF8_ENCODER.encode(JSON.stringify(checked));
  if (headerBytes.byteLength > DOCUMENT_LIMITS.maxHeaderBytes)
    throw new DocumentFormatError("limit-exceeded", "Envelope header exceeds 4096 bytes");
  const maxBytes =
    version === PROJECT_ENVELOPE_VERSION ? DOCUMENT_LIMITS.maxProjectFileBytes : DOCUMENT_LIMITS.maxFileBytes;
  if (PREFIX_BYTES + headerBytes.byteLength + payload.byteLength > maxBytes)
    throw new DocumentFormatError("limit-exceeded", "Document exceeds the file size limit");
  const result = new Uint8Array(PREFIX_BYTES + headerBytes.byteLength + payload.byteLength);
  result.set(MAGIC_BYTES, 0);
  result[8] = version;
  new DataView(result.buffer).setUint32(9, headerBytes.byteLength, true);
  result.set(headerBytes, PREFIX_BYTES);
  result.set(payload, PREFIX_BYTES + headerBytes.byteLength);
  return result;
}

export function decodeEnvelope(bytes: Uint8Array): DecodedEnvelope {
  if (bytes.byteLength < PREFIX_BYTES) invalid("Document envelope is truncated");
  if (!MAGIC_BYTES.every((byte, index) => bytes[index] === byte)) invalid("Document magic is invalid");
  const version = bytes[8];
  if (version !== ENVELOPE_VERSION && version !== PROJECT_ENVELOPE_VERSION)
    throw new DocumentFormatError("unsupported-version", `Unsupported envelope version ${bytes[8]}`);
  if (
    bytes.byteLength >
    (version === PROJECT_ENVELOPE_VERSION ? DOCUMENT_LIMITS.maxProjectFileBytes : DOCUMENT_LIMITS.maxFileBytes)
  )
    throw new DocumentFormatError("limit-exceeded", "Document exceeds the file size limit");
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(9, true);
  if (headerLength > DOCUMENT_LIMITS.maxHeaderBytes)
    throw new DocumentFormatError("limit-exceeded", "Envelope header exceeds 4096 bytes");
  const payloadOffset = PREFIX_BYTES + headerLength;
  if (payloadOffset > bytes.byteLength) invalid("Document header is truncated");
  const headerBytes = bytes.slice(PREFIX_BYTES, payloadOffset);
  let parsed: unknown;
  try {
    parsed = JSON.parse(UTF8_DECODER.decode(headerBytes));
  } catch {
    invalid("Envelope header is not strict UTF-8 JSON");
  }
  return {
    version,
    header: validateEnvelopeHeader(parsed),
    headerBytes,
    payload: bytes.slice(payloadOffset),
    authenticatedData: bytes.slice(0, payloadOffset),
  };
}
