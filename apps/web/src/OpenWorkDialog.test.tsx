// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
vi.mock("./recent-files", () => ({
  loadRecentFiles: async () => [{ id: "file", fileName: "missing.puml", destination: "diagram" }],
  readRecentHandle: async () => ({}),
  removeRecentFile: async () => {},
}));
vi.mock("./file-service", () => ({
  readDocumentBytes: async () => {
    throw new DOMException("Missing", "NotFoundError");
  },
  openDocumentFile: async () => undefined,
  readDocumentFile: vi.fn(),
}));
import { OpenWorkDialog } from "./OpenWorkDialog";
afterEach(cleanup);
it("offers recovery for moved files without opening or altering work", async () => {
  const open = vi.fn();
  const close = vi.fn();
  render(<OpenWorkDialog onOpen={open} onClose={close} />);
  fireEvent.click(await screen.findByRole("button", { name: "missing.puml" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("file was moved");
  expect(screen.getByRole("button", { name: "Locate file…" })).toBeVisible();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(close).toHaveBeenCalledOnce();
});
it("validates source before calling the shared opening route", async () => {
  const open = vi.fn();
  render(<OpenWorkDialog onOpen={open} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("PlantUML source"), { target: { value: "missing envelope" } });
  fireEvent.click(screen.getByRole("button", { name: "Import source" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Import one PlantUML diagram");
  expect(open).not.toHaveBeenCalled();
});
