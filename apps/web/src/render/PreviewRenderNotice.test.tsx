// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewRenderNotice } from "./PreviewRenderNotice";
import { syntaxErrorLocation } from "./syntax-error";

afterEach(cleanup);

describe("PreviewRenderNotice", () => {
  it("reads the line and offending text out of an engine syntax error", () => {
    expect(
      syntaxErrorLocation("Syntax Error? (Assumed diagram type: gantt) — line 6: [Testing] lasts banana days"),
    ).toEqual({ line: 6, text: "[Testing] lasts banana days" });
    expect(syntaxErrorLocation("Syntax Error? — line 3")).toEqual({ line: 3 });
    expect(syntaxErrorLocation("Rendering timed out")).toBeUndefined();
  });

  it("names the failing line and offers to reveal it instead of a retry that cannot help", () => {
    const onRetry = vi.fn();
    const reveal = vi.fn();
    window.addEventListener("reveal-source-line", reveal);
    render(
      <PreviewRenderNotice
        status="error"
        error="Syntax Error? (Assumed diagram type: gantt) — line 6: [Testing] lasts banana days"
        hasPreview
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Line 6 can't be drawn");
    expect(screen.getByText("[Testing] lasts banana days").tagName).toBe("CODE");
    expect(screen.queryByRole("button", { name: "Retry rendering" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to line 6" }));
    expect((reveal.mock.calls[0]![0] as CustomEvent).detail).toEqual({ line: 6 });
    window.removeEventListener("reveal-source-line", reveal);
  });

  it("keeps the retry action for renderer failures", () => {
    const onRetry = vi.fn();
    render(<PreviewRenderNotice status="error" error="Rendering timed out" hasPreview onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Preview could not be updated");
    fireEvent.click(screen.getByRole("button", { name: "Retry rendering" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
