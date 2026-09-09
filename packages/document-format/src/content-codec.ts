import { DOCUMENT_LIMITS, DocumentFormatError, type ContentRecord } from "./types";

const UTF8 = new TextEncoder();
const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true });

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashSource(source: string): Promise<string> {
  return sha256(UTF8.encode(source));
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new DocumentFormatError("invalid-file", "Invalid splice payload");
  }
}

function spliceRecord(id: string, source: Uint8Array, baseId: string, base: Uint8Array): ContentRecord {
  let prefix = 0;
  while (prefix < source.length && prefix < base.length && source[prefix] === base[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < source.length - prefix &&
    suffix < base.length - prefix &&
    source[source.length - suffix - 1] === base[base.length - suffix - 1]
  ) suffix += 1;
  const insert = source.slice(prefix, source.length - suffix);
  const full = { id, kind: "full" as const, source: UTF8_FATAL.decode(source), byteLength: source.length };
  const splice = {
    id,
    kind: "splice" as const,
    baseContentId: baseId,
    prefixBytes: prefix,
    deleteBytes: base.length - prefix - suffix,
    insertBase64: base64(insert),
    byteLength: source.length,
  };
  return UTF8.encode(JSON.stringify(splice)).length <= UTF8.encode(JSON.stringify(full)).length * 0.8 ? splice : full;
}

export async function encodeContentHistory(sources: readonly string[]): Promise<{
  contents: ContentRecord[];
  contentIds: string[];
}> {
  const contents: ContentRecord[] = [];
  const known = new Map<string, { bytes: Uint8Array; depth: number }>();
  const contentIds: string[] = [];
  let previousId: string | undefined;
  for (const source of sources) {
    const bytes = UTF8.encode(source);
    if (bytes.length > DOCUMENT_LIMITS.maxSourceBytes)
      throw new DocumentFormatError("limit-exceeded", "History source exceeds 5 MiB");
    const id = await sha256(bytes);
    contentIds.push(id);
    if (known.has(id)) {
      const knownBytes = known.get(id)!.bytes;
      if (knownBytes.length !== bytes.length || knownBytes.some((byte, index) => byte !== bytes[index]))
        throw new DocumentFormatError("invalid-file", "SHA-256 collision in document history");
      previousId = id;
      continue;
    }
    const previous = previousId ? known.get(previousId) : undefined;
    const record = previous && previous.depth < DOCUMENT_LIMITS.maxDeltaDepth
      ? spliceRecord(id, bytes, previousId!, previous.bytes)
      : { id, kind: "full" as const, source, byteLength: bytes.length };
    contents.push(record);
    known.set(id, { bytes, depth: record.kind === "splice" ? previous!.depth + 1 : 0 });
    previousId = id;
  }
  return { contents, contentIds };
}

export async function reconstructContents(records: readonly ContentRecord[]): Promise<Map<string, string>> {
  const expanded = new Map<string, { bytes: Uint8Array; depth: number; source: string }>();
  let totalBytes = 0;
  for (const record of records) {
    let bytes: Uint8Array;
    let depth = 0;
    if (record.kind === "full") bytes = UTF8.encode(record.source);
    else {
      const base = expanded.get(record.baseContentId);
      if (!base) throw new DocumentFormatError("invalid-file", "Splice references unavailable base content");
      depth = base.depth + 1;
      if (depth > DOCUMENT_LIMITS.maxDeltaDepth)
        throw new DocumentFormatError("invalid-file", "Splice chain exceeds maximum depth");
      const insert = fromBase64(record.insertBase64);
      const end = record.prefixBytes + record.deleteBytes;
      if (record.prefixBytes > base.bytes.length || end > base.bytes.length)
        throw new DocumentFormatError("invalid-file", "Splice range exceeds base content");
      bytes = new Uint8Array(record.prefixBytes + insert.length + base.bytes.length - end);
      bytes.set(base.bytes.slice(0, record.prefixBytes));
      bytes.set(insert, record.prefixBytes);
      bytes.set(base.bytes.slice(end), record.prefixBytes + insert.length);
    }
    if (bytes.length !== record.byteLength || (await sha256(bytes)) !== record.id)
      throw new DocumentFormatError("invalid-file", "Content length or hash does not match");
    totalBytes += bytes.length;
    if (totalBytes > DOCUMENT_LIMITS.maxExpandedHistoryBytes)
      throw new DocumentFormatError("limit-exceeded", "Expanded unique history exceeds 64 MiB");
    let source: string;
    try {
      source = UTF8_FATAL.decode(bytes);
    } catch {
      throw new DocumentFormatError("invalid-file", "Content is not valid UTF-8");
    }
    expanded.set(record.id, { bytes, depth, source });
  }
  return new Map([...expanded].map(([id, value]) => [id, value.source]));
}
