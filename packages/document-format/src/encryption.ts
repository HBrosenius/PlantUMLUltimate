import { DocumentFormatError, type EncryptedEnvelopeHeader } from "./types";

const UTF8 = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export interface UnlockedDocumentKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

export type RandomBytes = (length: number) => Uint8Array;

export const secureRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export async function deriveDocumentKey(
  password: string,
  salt: Uint8Array,
  iterations = 600_000,
): Promise<UnlockedDocumentKey> {
  if (iterations < 600_000 || iterations > 2_000_000 || !Number.isSafeInteger(iterations))
    throw new DocumentFormatError("invalid-file", "PBKDF2 work factor is outside supported limits");
  const material = await crypto.subtle.importKey("raw", UTF8.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: Uint8Array.from(salt).buffer, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { key, salt: Uint8Array.from(salt), iterations };
}

export function encryptedHeader(
  compression: "gzip" | "none",
  unlocked: UnlockedDocumentKey,
  iv: Uint8Array,
): EncryptedEnvelopeHeader {
  return {
    compression,
    encryption: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: unlocked.iterations,
    salt: base64(unlocked.salt),
    iv: base64(iv),
    tagBits: 128,
  };
}

export async function unlockHeader(password: string, header: EncryptedEnvelopeHeader): Promise<UnlockedDocumentKey> {
  return deriveDocumentKey(password, unbase64(header.salt), header.iterations);
}

export async function encryptPayload(
  payload: Uint8Array,
  unlocked: UnlockedDocumentKey,
  iv: Uint8Array,
  authenticatedData: Uint8Array,
): Promise<Uint8Array> {
  const result = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: Uint8Array.from(iv).buffer,
      additionalData: Uint8Array.from(authenticatedData).buffer,
      tagLength: 128,
    },
    unlocked.key,
    Uint8Array.from(payload).buffer,
  );
  return new Uint8Array(result);
}

export async function decryptPayload(
  payload: Uint8Array,
  unlocked: UnlockedDocumentKey,
  header: EncryptedEnvelopeHeader,
  authenticatedData: Uint8Array,
): Promise<Uint8Array> {
  try {
    const result = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(unbase64(header.iv)).buffer,
        additionalData: Uint8Array.from(authenticatedData).buffer,
        tagLength: header.tagBits,
      },
      unlocked.key,
      Uint8Array.from(payload).buffer,
    );
    return new Uint8Array(result);
  } catch {
    throw new DocumentFormatError("unlock-failed", "Incorrect password or damaged file");
  }
}
