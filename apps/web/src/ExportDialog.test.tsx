// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExportDialog } from "./ExportDialog";
vi.mock("./use-dialog-focus", () => ({ useDialogFocus: vi.fn() }));
afterEach(cleanup);
it("offers a lower scale or SVG before an oversized raster export", () => {
  localStorage.clear();
  render(
    <ExportDialog
      mode="export"
      source="large"
      svg={'<svg xmlns="http://www.w3.org/2000/svg" width="8200" height="1000"/>'}
      fileName="large.puml"
      current
      renderStatus="idle"
      onRender={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: "png" } });
  expect(screen.getByRole("alert", { name: "Image export size limit" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Download PNG" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use 1× scale" }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByRole("button", { name: "Download PNG" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByRole("combobox", { name: "Raster scale" }), { target: { value: "3" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Format" }), { target: { value: "pdf" } });
  expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Switch to SVG" }));
  expect((screen.getByRole("button", { name: "Download SVG" }) as HTMLButtonElement).disabled).toBe(false);
});
it("identifies stale output and prevents downloading it until its revision is current", () => {
  const props = {
    mode: "export" as const,
    source: "new source",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"/>',
    fileName: "diagram.puml",
    onClose: vi.fn(),
    renderStatus: "idle" as const,
    onRender: vi.fn(),
  };
  const view = render(<ExportDialog {...props} current={false} />);
  expect(screen.getByText(/Preview is stale/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Download SVG" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Render current source" }));
  expect(props.onRender).toHaveBeenCalledOnce();
  view.rerender(<ExportDialog {...props} current={false} renderStatus="rendering" />);
  expect(screen.getByRole("status").textContent).toContain("Rendering the current source");
  expect(screen.queryByRole("button", { name: "Render current source" })).toBeNull();
  view.rerender(<ExportDialog {...props} current={false} renderStatus="error" renderError="Renderer failed" />);
  expect(screen.getByRole("alert").textContent).toContain("Renderer failed");
  fireEvent.click(screen.getByRole("button", { name: "Retry rendering" }));
  expect(props.onRender).toHaveBeenCalledTimes(2);
  expect((screen.getByRole("button", { name: "Download SVG" }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<ExportDialog {...props} current />);
  expect((screen.getByRole("button", { name: "Download SVG" }) as HTMLButtonElement).disabled).toBe(false);
});
it("requires destination disclosure and generates text without loading an external image", () => {
  render(
    <ExportDialog
      mode="share"
      source="@startuml\nA -> B\n@enduml"
      fileName="diagram.puml"
      current
      renderStatus="idle"
      onRender={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  const generate = screen.getByRole("button", { name: "Generate link locally" }) as HTMLButtonElement;
  expect(generate.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(generate);
  expect((screen.getByLabelText("Encoded image URL") as HTMLTextAreaElement).value).toContain("/svg/~h");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});
it("clears generated links and disclosure consent when source changes", () => {
  const props = {
    mode: "share" as const,
    fileName: "diagram.puml",
    current: true,
    onClose: vi.fn(),
    renderStatus: "idle" as const,
    onRender: vi.fn(),
  };
  const view = render(<ExportDialog {...props} source="old source" />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Generate link locally" }));
  expect(screen.getByLabelText("Encoded image URL")).toBeTruthy();
  view.rerender(<ExportDialog {...props} source="new source" />);
  expect(screen.queryByLabelText("Encoded image URL")).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});
