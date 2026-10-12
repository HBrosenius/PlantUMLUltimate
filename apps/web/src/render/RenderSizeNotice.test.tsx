// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RenderSizeNotice } from "./RenderSizeNotice";
import { renderSizeLimit } from "./size-limit";

afterEach(cleanup);

it("dismisses the expanded guidance so editing controls remain reachable", () => {
  render(
    <details open>
      <RenderSizeNotice
        error="Diagram too large for browser rendering: 5000x50 (max 4096)"
        hasPreviousPreview={false}
        gantt
      />
    </details>,
  );
  const notice = screen.getByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Continue editing" }));
  expect(notice.closest("details")?.hasAttribute("open")).toBe(false);
});

it("explains engine dimensions, stale preview and available editing without calling source invalid", () => {
  render(
    <RenderSizeNotice
      error="java.lang.RuntimeException: Diagram too large for browser rendering: 2260x9140 (max 4096)"
      hasPreviousPreview
      gantt
    />,
  );
  const notice = screen.getByRole("alert", { name: "Preview size limit" });
  expect(notice.textContent).toContain("earlier successful render");
  expect(notice.textContent).toContain("task table");
  expect(notice.textContent).toContain("source remains available to edit and save");
  expect(renderSizeLimit("Diagram too large for browser rendering: 2260x9140 (max 4096)")).toEqual({
    width: 2260,
    height: 9140,
    limit: 4096,
  });
});

it("keeps unrelated renderer errors on their existing path", () => {
  render(<RenderSizeNotice error="Syntax error" hasPreviousPreview={false} gantt={false} />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(renderSizeLimit(undefined)).toBeUndefined();
  expect(renderSizeLimit("Diagram too large for browser rendering: 0x20 (max 4096)")).toBeUndefined();
});

it("does not claim a stale preview or Gantt controls when neither applies", () => {
  render(
    <RenderSizeNotice
      error="Diagram too large for browser rendering: 5000x50 (max 4096)"
      hasPreviousPreview={false}
      gantt={false}
    />,
  );
  const notice = screen.getByRole("alert");
  expect(notice.textContent).not.toContain("earlier successful render");
  expect(notice.textContent).not.toContain("task table");
});
