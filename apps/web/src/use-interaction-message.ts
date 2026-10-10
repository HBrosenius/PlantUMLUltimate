import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Only explicit successes expire. Failures and required actions use the persistent setter. */
export function useInteractionMessage(documentId: string, source: string) {
  const [notice, setNotice] = useState<{
    text: string | undefined;
    transient: boolean;
    documentId: string;
    source: string;
  }>();
  const setMessage: Dispatch<SetStateAction<string | undefined>> = useCallback((value) => {
    setNotice((current) => ({
      text: typeof value === "function" ? value(current?.text) : value,
      transient: false,
      documentId: "",
      source: "",
    }));
  }, []);
  const notifySuccess = useCallback(
    (text: string, context = { documentId, source }) => {
      setNotice({ text, transient: true, ...context });
    },
    [documentId, source],
  );
  useEffect(() => {
    if (!notice?.transient) return;
    if (notice.documentId !== documentId || notice.source !== source) {
      setNotice((current) => (current === notice ? undefined : current));
      return;
    }
    const timer = window.setTimeout(() => setNotice((current) => (current === notice ? undefined : current)), 5000);
    return () => window.clearTimeout(timer);
  }, [notice, documentId, source]);
  const expired = notice?.transient && (notice.documentId !== documentId || notice.source !== source);
  return { message: expired ? undefined : notice?.text, setMessage, notifySuccess };
}
