// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InspectorPanel } from "./InspectorPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("does not restore the old opener when switching to different properties", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  try {
    const view = render(
      <InspectorPanel key="task" className="task-inspector" aria-label="Task">
        <button>Task action</button>
      </InspectorPanel>,
    );
    screen.getByRole("button", { name: "Task action" }).focus();
    const focus = vi.spyOn(opener, "focus");
    view.rerender(
      <InspectorPanel key="wbs" className="task-inspector" aria-label="WBS">
        <button>WBS action</button>
      </InspectorPanel>,
    );
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    opener.remove();
  }
});

it("protects staged settings that use an Apply button without a form", async () => {
  const onClose = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <InspectorPanel className="task-inspector" aria-label="Settings">
      <header>
        <button aria-label="Close settings" onClick={onClose}>
          Close
        </button>
      </header>
      <label>
        Title
        <input defaultValue="Original" />
      </label>
      <button>Apply</button>
    </InspectorPanel>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Title" }), " draft");
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Original draft");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await user.click(screen.getByRole("button", { name: "Close settings" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it("does not treat immediately applied capacity controls as a rename form draft", async () => {
  const onClose = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <InspectorPanel className="task-inspector" aria-label="Resources">
      <header>
        <button aria-label="Close resources" onClick={onClose}>
          Close
        </button>
      </header>
      <label>
        Capacity
        <input type="number" min={1} step={5} defaultValue={100} />
      </label>
      <form>
        <label>
          Rename
          <input defaultValue="Alice" />
        </label>
        <button type="submit">Save</button>
      </form>
    </InspectorPanel>,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByRole("spinbutton", { name: "Capacity" }));
  await user.type(screen.getByRole("spinbutton", { name: "Capacity" }), "50");
  await user.click(screen.getByRole("button", { name: "Close resources" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
