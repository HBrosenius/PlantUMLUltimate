// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
const renderer = vi.hoisted(() => vi.fn());
vi.mock("./render/use-renderer", () => ({
  rendererLayoutEngineForDiagramKind: () => "native",
  useRenderer: renderer,
}));
import { ThemeGallery } from "./ThemeGallery";
afterEach(cleanup);
it("caches fixed sample thumbnails and keeps custom source themes selectable", async () => {
  renderer.mockImplementation((source: string, enabled: boolean) => ({
    result: enabled ? { source, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Sample</text></svg>' } : undefined,
  }));
  const change = vi.fn();
  const view = render(<ThemeGallery value="team-theme" onChange={change} diagramKind="class" label="PlantUML theme" />);
  await waitFor(() => expect(document.querySelectorAll(".theme-thumbnail img")).toHaveLength(6));
  expect(screen.getByRole("option", { name: "team-theme (from source)" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "minty" }));
  expect(change).toHaveBeenCalledWith("minty");
  expect(
    renderer.mock.calls.every(([source]) => source.includes("class Order") && !source.includes("working document")),
  ).toBe(true);
  view.unmount();
  renderer.mockClear();
  render(<ThemeGallery value="team-theme" onChange={change} diagramKind="class" label="PlantUML theme" />);
  expect(document.querySelectorAll(".theme-thumbnail img")).toHaveLength(6);
  expect(renderer.mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
});
it("reports failed previews and continues loading the remaining samples", async () => {
  renderer.mockImplementation((source: string, enabled: boolean) => ({
    result: enabled
      ? source.includes("!theme broken")
        ? { source, error: "Unavailable" }
        : { source, svg: '<svg xmlns="http://www.w3.org/2000/svg" />' }
      : undefined,
  }));
  render(<ThemeGallery value="broken" onChange={vi.fn()} diagramKind="activity" label="PlantUML theme" />);
  await waitFor(() => expect(document.querySelectorAll(".theme-thumbnail img")).toHaveLength(6));
  expect(screen.getByText("Theme preview unavailable")).toBeInTheDocument();
});
