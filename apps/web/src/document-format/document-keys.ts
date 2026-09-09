import type { UnlockedDocumentKey } from "@plantuml-studio/document-format";

const keys = new Map<string, UnlockedDocumentKey>();
export const rememberDocumentKey = (documentId: string, key: UnlockedDocumentKey): void => { keys.set(documentId, key); };
export const documentKey = (documentId: string): UnlockedDocumentKey | undefined => keys.get(documentId);
export const forgetDocumentKey = (documentId: string): void => { keys.delete(documentId); };
