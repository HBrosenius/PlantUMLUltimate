// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreviewRenderNotice } from "./PreviewRenderNotice";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("explains retained previews and exposes retry after a failure", () => {
  const retry = vi.fn();
  const view = render(<PreviewRenderNotice status="error" error="Rendering timed out" hasPreview onRetry={retry} />);
  expect(screen.getByRole("alert").textContent).toContain("last successful diagram");
  expect(screen.getByRole("alert").textContent).toContain("Rendering timed out");
  fireEvent.click(screen.getByRole("button", { name: "Retry rendering" }));
  expect(retry).toHaveBeenCalledOnce();
  view.rerender(<PreviewRenderNotice status="idle" hasPreview onRetry={retry} />);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("explains slow renders and resets the timer after recovery", () => {
  vi.useFakeTimers();
  const props = { hasPreview: false, onRetry: vi.fn() };
  const view = render(<PreviewRenderNotice {...props} status="rendering" />);
  expect(screen.getByRole("status").textContent).not.toContain("last successful");
  act(() => vi.advanceTimersByTime(5_000));
  expect(screen.getByRole("status").textContent).toContain("Still rendering");
  view.rerender(<PreviewRenderNotice {...props} status="idle" />);
  view.rerender(<PreviewRenderNotice {...props} status="rendering" />);
  expect(screen.getByRole("status").textContent).not.toContain("Still rendering");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
