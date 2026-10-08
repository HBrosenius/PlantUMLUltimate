import { useEffect, useState } from "react";
import { savePreference } from "./browser-preferences";
import { storageGet } from "./safe-storage";

export const RESOURCE_WARNING_PREFERENCE = "plantuml-studio.show-resource-overallocation-warnings";

export function useResourceWarningPreference() {
  const [enabled, setEnabled] = useState(() => storageGet(RESOURCE_WARNING_PREFERENCE) !== "false");
  useEffect(() => {
    savePreference(RESOURCE_WARNING_PREFERENCE, String(enabled));
  }, [enabled]);
  return { enabled, setEnabled };
}
