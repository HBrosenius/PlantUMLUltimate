import type { DiagramKind } from "./model";
import type { Diagnostic } from "@codemirror/lint";
import type { DiagramQuickFix } from "./diagram-diagnostics";

export function manualErrorGuidance(
  kind: DiagramKind,
  diagnostic: Diagnostic,
  fixes: readonly DiagramQuickFix[],
): string | undefined {
  if (diagnostic.severity !== "error" || diagnostic.actions?.length) return undefined;
  if (fixes.some((fix) => fix.from <= diagnostic.to && fix.to >= diagnostic.from)) return undefined;
  const message = diagnostic.message;
  const suffix = kind === "gantt" ? "gantt" : kind === "wbs" ? "wbs" : "uml";
  const tags = `@start${suffix} and @end${suffix}`;
  const examples: Record<DiagramKind, string> = {
    class: 'class "Order details" as Order',
    component: 'component "Order details" as Order',
    sequence: 'participant "Order details" as Order',
    usecase: 'usecase "Order details" as Order',
    activity: ":Order details;",
    gantt: "[Order details] lasts 3 days",
    wbs: "* Order details",
  };
  // Block-closing repairs can insert text well after the diagnostic's header.
  if (/missing\s+\}|unclosed|unterminated/i.test(message) && fixes.some((fix) => /close|insert end/i.test(fix.message)))
    return undefined;
  if (/unmatched quote/i.test(message)) {
    if (kind === "gantt" || kind === "wbs" || kind === "activity")
      return `Check the label syntax for this ${kind.toUpperCase()} diagram, for example: ${examples[kind]} Quotes are not needed around this label. Review the intended text before editing it manually.`;
    return `Check where the label begins and ends, then add or remove the matching double quote. Keep aliases after the closing quote, for example: ${examples[kind]}. The intended label boundary is ambiguous, so it needs a manual edit.`;
  }
  if (/another opening tag/i.test(message))
    return "Check whether you intended one diagram or separate diagrams. Each @start tag needs its own matching @end tag before another diagram begins. Remove the extra opening tag or close the preceding diagram; the editor cannot choose which structure you intended.";
  if (/opening and closing tags do not match/i.test(message))
    return `Use the same diagram suffix on the opening and closing tags: ${tags} for this ${kind.toUpperCase()} diagram. Check which diagram type you intended before editing the tags.`;
  if (/closing tag.*(no matching|before)/i.test(message))
    return `Place a matching @start${suffix} tag before this @end${suffix} tag, or remove the closing tag if it is extra. Check the surrounding diagram blocks before deciding which tag to change.`;
  if (/dependency cycle/i.test(message))
    return "Follow the task chain shown in the error. Change or remove a dependency so the chain no longer returns to its starting task. Choosing which dependency to change requires your intended task order.";
  if (/invalid.*date|date.*invalid/i.test(message))
    return "Check the intended date and use a real calendar date in YYYY-MM-DD form, for example 2026-09-21. The editor cannot infer the date you meant.";
  if (kind === "gantt" && /duration|must be.*positive/i.test(message))
    return "Check the intended duration and enter a supported positive value with its unit, for example: [Build] lasts 3 days. The editor cannot choose the duration for you.";
  if (/unknown.*task|task.*(not found|does not exist)|undefined.*task/i.test(message))
    return "Check the referenced task name against its declaration, including spelling and brackets. Correct the reference or declare the intended task before using it.";
  if (/unsupported/i.test(message))
    return `Check that this statement belongs to the selected diagram type (${kind.toUpperCase()}). Review the keyword and its arguments, then edit the statement manually; the editor has no supported correction for this syntax.`;
  return "Review this statement and the surrounding lines using the error above. Edit the intended syntax manually, then check Issues again. No automatic correction is available for this statement.";
}

/** Add UI guidance without changing diagnostic messages, ranges, or actions. */
export function withManualErrorGuidance(
  kind: DiagramKind,
  diagnostics: readonly Diagnostic[],
  fixes: readonly DiagramQuickFix[],
): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const guidance = manualErrorGuidance(kind, diagnostic, fixes);
    if (!guidance) return diagnostic;
    return {
      ...diagnostic,
      renderMessage(view) {
        const doc = view.dom.ownerDocument;
        const message = doc.createElement("div");
        message.className = "cm-manual-error-guidance";
        const title = doc.createElement("div");
        title.textContent = diagnostic.message;
        const heading = doc.createElement("strong");
        heading.textContent = "How to resolve";
        const explanation = doc.createElement("div");
        explanation.textContent = guidance;
        message.append(title, heading, explanation);
        return message;
      },
    };
  });
}
