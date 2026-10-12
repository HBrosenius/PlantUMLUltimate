// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectItemSelect } from "./ProjectItemSelect";

afterEach(cleanup);

it("reaches every item through paging and search while retaining the selected item", () => {
  const options = Array.from({ length: 205 }, (_, index) => ({ id: String(index), label: `Diagram item ${index}` }));
  const onChange = vi.fn();
  const props = { label: "Source", placeholder: "Choose", options, value: "", onChange };
  const view = render(<ProjectItemSelect {...props} />);
  expect(screen.getAllByRole("option")).toHaveLength(101);
  fireEvent.click(screen.getByRole("button", { name: "Next source items" }));
  fireEvent.click(screen.getByRole("button", { name: "Next source items" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Source" }), { target: { value: "204" } });
  expect(onChange).toHaveBeenCalledWith("204");
  view.rerender(<ProjectItemSelect {...props} value="204" />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "item 12" } });
  expect(screen.getByRole("option", { name: "Diagram item 12" })).toBeTruthy();
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("204");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
  expect(screen.getByText("No matching items")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next source items" }).hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  expect(screen.getByText("1-100 of 205 items")).toBeTruthy();
  expect(screen.getAllByRole("option")).toHaveLength(102);
});

it("clamps the page when compatible items shrink and keeps small selectors unchanged", () => {
  const options = Array.from({ length: 201 }, (_, index) => ({ id: String(index), label: `Item ${index}` }));
  const props = { label: "Target", placeholder: "Choose", options, value: "", onChange: vi.fn() };
  const view = render(<ProjectItemSelect {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Next target items" }));
  fireEvent.click(screen.getByRole("button", { name: "Next target items" }));
  view.rerender(<ProjectItemSelect {...props} options={options.slice(0, 101)} />);
  expect(screen.getByText("101-101 of 101 items")).toBeTruthy();
  view.rerender(<ProjectItemSelect {...props} options={options.slice(0, 2)} disabled />);
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.getAllByRole("option")).toHaveLength(3);
  expect(screen.getByRole("combobox").hasAttribute("disabled")).toBe(true);
});
