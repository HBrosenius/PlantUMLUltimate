import { storageGet } from "../../safe-storage";
import { defaultIntroduction, defaultSignOff } from "./report-model";

const wordingKeys = {
  introduction: "plantuml-ultimate.reports.introduction",
  signOff: "plantuml-ultimate.reports.sign-off",
};

export function reportWording() {
  return {
    introduction: storageGet(wordingKeys.introduction) ?? defaultIntroduction,
    signOff: storageGet(wordingKeys.signOff) ?? defaultSignOff,
  };
}

export function saveReportWording(field: keyof typeof wordingKeys, value: string): void {
  try {
    globalThis.localStorage?.setItem(wordingKeys[field], value);
  } catch {
    // Editing remains available when browser storage is disabled.
  }
}
