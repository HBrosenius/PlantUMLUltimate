// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FormatSourceDialog } from "./FormatSourceDialog";
vi.mock("./use-dialog-focus", () => ({ useDialogFocus: vi.fn() }));
afterEach(cleanup);
const source = "@startuml\n participant A\n participant B\n A -> B: hello\n@enduml";
it("shows whitespace diff and applies only after explicit acceptance", () => {
  const onApply = vi.fn<(source: string) => boolean>(() => true),
    onClose = vi.fn();
  render(
    <FormatSourceDialog source={source} kind="sequence" current readOnly={false} onApply={onApply} onClose={onClose} />,
  );
  expect(screen.getByRole("list", { name: "Formatting diff" }).textContent).toContain("·participant A");
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply formatting" }));
  expect(onApply).toHaveBeenCalledOnce();
  expect(onApply.mock.calls[0]?.[0]).not.toContain("\n participant");
  expect(onClose).toHaveBeenCalledOnce();
});
it("keeps changed-source and read-only previews from applying", () => {
  const props = { source, kind: "sequence" as const, onApply: vi.fn(() => true), onClose: vi.fn() };
  const view = render(<FormatSourceDialog {...props} current={false} readOnly={false} />);
  expect((screen.getByRole("button", { name: "Apply formatting" }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<FormatSourceDialog {...props} current readOnly />);
  expect((screen.getByRole("button", { name: "Apply formatting" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onApply).not.toHaveBeenCalled();
});
it("explains unsupported source without offering an applicable change", () => {
  render(
    <FormatSourceDialog
      source={"@startuml\n!include secret.puml\n@enduml"}
      kind="class"
      current
      readOnly={false}
      onApply={vi.fn(() => true)}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("Preprocessor");
  expect((screen.getByRole("button", { name: "Apply formatting" }) as HTMLButtonElement).disabled).toBe(true);
});
