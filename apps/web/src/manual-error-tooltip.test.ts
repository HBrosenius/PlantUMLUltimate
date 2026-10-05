// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { EditorView } from "@codemirror/view";
import type { Diagnostic } from "@codemirror/lint";
import { manualErrorGuidance, withManualErrorGuidance } from "./manual-error-guidance";

describe("manual error tooltip", () => {
  const error: Diagnostic = { from: 0, to: 10, severity: "error", message: "Quoted label has an unmatched quote" };
  it("uses the same guidance as Problems without changing diagnostic identity fields", () => {
    const result = withManualErrorGuidance("class", [error], [])[0]!;
    const view = { dom: document.createElement("div") } as unknown as EditorView;
    const node = result.renderMessage!(view) as HTMLElement;
    expect(node.textContent).toContain(error.message);
    expect(node.textContent).toContain(manualErrorGuidance("class", error, []));
    expect(node.querySelector("strong")?.textContent).toBe("How to resolve");
    expect(result.from).toBe(error.from);
    expect(result.to).toBe(error.to);
    expect(result.message).toBe(error.message);
  });
  it("leaves fixable diagnostics and their actions unchanged", () => {
    const action = { name: "Fix", apply() {} };
    const fixable = { ...error, actions: [action] };
    expect(withManualErrorGuidance("class", [fixable], [])[0]).toBe(fixable);
    expect(withManualErrorGuidance("class", [{ ...error, severity: "warning" }], [])[0]?.renderMessage).toBeUndefined();
  });
  it("renders source-derived text as text rather than HTML", () => {
    const result = withManualErrorGuidance("class", [{ ...error, message: '<img src=x onerror="alert(1)">' }], [])[0]!;
    const node = result.renderMessage!({ dom: document.createElement("div") } as unknown as EditorView) as HTMLElement;
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
