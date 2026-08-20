import { parseGantt, type Diagnostic } from "@plantuml-studio/diagram-gantt";

export interface GeneratedSourceValidation {
  valid: boolean;
  introduced: Diagnostic[];
  message?: string;
}

export function validateGeneratedSource(before: string, after: string): GeneratedSourceValidation {
  if (!/^\s*@startgantt\b/im.test(after) || !/^\s*@endgantt\b/im.test(after)) {
    return {
      valid: false,
      introduced: [],
      message: "The operation would remove a required @startgantt or @endgantt marker.",
    };
  }
  const errors = (source: string) => parseGantt(source).diagnostics.filter((item) => item.severity === "error");
  const remaining = new Map<string, number>();
  for (const diagnostic of errors(before)) {
    const key = `${diagnostic.code}\u0000${diagnostic.message}`;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const introduced = errors(after).filter((diagnostic) => {
    const key = `${diagnostic.code}\u0000${diagnostic.message}`;
    const count = remaining.get(key) ?? 0;
    if (count < 1) return true;
    remaining.set(key, count - 1);
    return false;
  });
  const unsupportedBefore = parseGantt(before)
    .document.unknown.map((item) => item.text)
    .sort();
  const unsupportedAfter = parseGantt(after)
    .document.unknown.map((item) => item.text)
    .sort();
  if (unsupportedBefore.join("\u0000") !== unsupportedAfter.join("\u0000")) {
    return {
      valid: false,
      introduced,
      message: "The operation would modify syntax that is preserved but not visually editable.",
    };
  }
  return introduced.length
    ? { valid: false, introduced, message: `The operation would introduce ${introduced[0]!.message.toLowerCase()}` }
    : { valid: true, introduced: [] };
}
