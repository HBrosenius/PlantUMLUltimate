// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMindmap } from "@plantuml-studio/diagram-mindmap";
import { AddMindmapNodeDialog } from "./MindmapDialogs";
import { MindmapNodeInspector, MindmapSettingsInspector } from "./MindmapInspectors";
import { mindmapSettingsOf } from "./use-mindmap-actions";

afterEach(cleanup);

const document = parseMindmap("@startmindmap\n* Root\n**[#red] Child <<big>>\n*** Leaf\n@endmindmap");

function inspector(nodeIndex: number, overrides: Partial<Parameters<typeof MindmapNodeInspector>[0]> = {}) {
  const handlers = {
    onApply: vi.fn(),
    onToggleBoxless: vi.fn(),
    onSideChange: vi.fn(),
    onDelete: vi.fn(),
    onAddChild: vi.fn(),
    onAddSibling: vi.fn(),
    onConvert: vi.fn(),
    onClose: vi.fn(),
  };
  render(<MindmapNodeInspector node={document.nodes[nodeIndex]!} sidesApply {...handlers} {...overrides} />);
  return handlers;
}

describe("MindmapNodeInspector", () => {
  it("shows the node's fields", () => {
    inspector(1);
    expect((screen.getByLabelText("Label") as HTMLTextAreaElement).value).toBe("Child");
    expect((screen.getByLabelText("Style class") as HTMLInputElement).value).toBe("big");
    expect((screen.getByLabelText("Branch side") as HTMLSelectElement).value).toBe("right");
    expect((screen.getByLabelText("Draw without a box") as HTMLInputElement).checked).toBe(false);
  });

  it("applies a renamed label when the field is left, with the other fields unchanged", () => {
    const { onApply } = inspector(1);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Renamed" } });
    fireEvent.blur(screen.getByLabelText("Label"));
    expect(onApply).toHaveBeenCalledWith({
      label: "Renamed",
      color: "#red",
      textColor: "",
      stereotype: "big",
      link: "",
      icon: "",
    });
  });

  it("does not apply an unchanged or empty label", () => {
    const { onApply } = inspector(1);
    const label = screen.getByLabelText("Label");
    fireEvent.blur(label);
    fireEvent.change(label, { target: { value: "  " } });
    fireEvent.blur(label);
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a node label.")).toBeTruthy();
  });

  it("rejects a style class with spaces", () => {
    const { onApply } = inspector(1);
    const field = screen.getByLabelText("Style class");
    fireEvent.change(field, { target: { value: "two words" } });
    fireEvent.blur(field);
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/one word without spaces/)).toBeTruthy();
  });

  it("toggles the box and changes the side through their own operations", () => {
    const { onToggleBoxless, onSideChange } = inspector(1);
    fireEvent.click(screen.getByLabelText("Draw without a box"));
    expect(onToggleBoxless).toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText("Branch side"), { target: { value: "left" } });
    expect(onSideChange).toHaveBeenCalledWith("left");
  });

  it("offers a side only for the children of a root", () => {
    inspector(2);
    expect(screen.queryByLabelText("Branch side")).toBeNull();
  });

  it("hides the side control when sides mean nothing (right to left)", () => {
    inspector(1, { sidesApply: false });
    expect(screen.queryByLabelText("Branch side")).toBeNull();
  });

  it("disables deleting the only root and explains why", () => {
    const { onDelete } = inspector(0, { deleteBlocker: "The only root cannot be deleted" });
    const button = screen.getByRole("button", { name: "Delete subtree" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("mindmap-delete-blocker").textContent).toContain("only root");
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("offers child and sibling creation, and no sibling for a root", () => {
    const { onAddChild, onAddSibling } = inspector(1);
    fireEvent.click(screen.getByRole("button", { name: "Add child…" }));
    fireEvent.click(screen.getByRole("button", { name: "Add sibling…" }));
    expect(onAddChild).toHaveBeenCalled();
    expect(onAddSibling).toHaveBeenCalled();
    cleanup();
    inspector(0);
    expect(screen.queryByRole("button", { name: "Add sibling…" })).toBeNull();
  });

  it("shows the convert path instead of editing fields for a Markdown-form node", () => {
    const markdown = parseMindmap("@startmindmap\n# Root\n## Child\n@endmindmap");
    const { onConvert } = inspector(1, { node: markdown.nodes[1]! });
    expect(screen.queryByLabelText("Label")).toBeNull();
    expect((screen.getByRole("button", { name: "Add child…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Convert to * markers" }));
    expect(onConvert).toHaveBeenCalled();
  });
});

describe("MindmapSettingsInspector", () => {
  const fresh = parseMindmap("@startmindmap\ntitle Old\n* Root\n@endmindmap");

  it("offers only the directions the app supports", () => {
    render(
      <MindmapSettingsInspector
        document={fresh}
        initial={mindmapSettingsOf(fresh)}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const options = [...(screen.getByLabelText("Direction") as HTMLSelectElement).options].map((o) => o.value);
    expect(options).toEqual(["", "left-to-right", "top-to-bottom", "right-to-left"]);
  });

  it("offers the Markdown conversion only for a Markdown-form document", () => {
    const onConvert = vi.fn();
    const markdown = parseMindmap("@startmindmap\n# Root\n## Child\n@endmindmap");
    const { unmount } = render(
      <MindmapSettingsInspector
        document={markdown}
        initial={mindmapSettingsOf(markdown)}
        onApply={vi.fn()}
        onConvert={onConvert}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Convert to * markers" }));
    expect(onConvert).toHaveBeenCalledOnce();
    unmount();
    render(
      <MindmapSettingsInspector
        document={fresh}
        initial={mindmapSettingsOf(fresh)}
        onApply={vi.fn()}
        onConvert={onConvert}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Convert to * markers" })).toBeNull();
  });

  it("keeps a direction that is already in the document selectable", () => {
    const btt = parseMindmap("@startmindmap\nbottom to top direction\n* Root\n@endmindmap");
    render(
      <MindmapSettingsInspector document={btt} initial={mindmapSettingsOf(btt)} onApply={vi.fn()} onClose={vi.fn()} />,
    );
    const select = screen.getByLabelText("Direction") as HTMLSelectElement;
    expect(select.value).toBe("bottom-to-top");
  });

  it("applies every setting together", () => {
    const onApply = vi.fn();
    render(
      <MindmapSettingsInspector
        document={fresh}
        initial={mindmapSettingsOf(fresh)}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "top-to-bottom" } });
    fireEvent.change(screen.getByLabelText("Diagram title"), { target: { value: "New title" } });
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "A caption" } });
    fireEvent.change(screen.getByLabelText("Header"), { target: { value: "Head" } });
    fireEvent.change(screen.getByLabelText("Footer"), { target: { value: "Foot" } });
    fireEvent.change(screen.getByLabelText("Legend"), { target: { value: "Key" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({
      direction: "top-to-bottom",
      title: "New title",
      caption: "A caption",
      header: "Head",
      footer: "Foot",
      legend: "Key",
    });
  });

  it("clears the direction when the default is chosen", () => {
    const withDirection = parseMindmap("@startmindmap\ntop to bottom direction\n* Root\n@endmindmap");
    const onApply = vi.fn();
    render(
      <MindmapSettingsInspector
        document={withDirection}
        initial={mindmapSettingsOf(withDirection)}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply.mock.calls[0]![0].direction).toBeUndefined();
  });
});

describe("AddMindmapNodeDialog", () => {
  it("adds a child with the chosen side under a root", () => {
    const onAdd = vi.fn();
    render(<AddMindmapNodeDialog selected={document.nodes[0]} hasRoot sidesApply onAdd={onAdd} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Idea" } });
    fireEvent.change(screen.getByLabelText("Branch side"), { target: { value: "left" } });
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect(onAdd).toHaveBeenCalledWith({ label: "Idea", color: "", textColor: "", side: "left" }, "child");
  });

  it("offers a root when the document has none, and no side for it", () => {
    const onAdd = vi.fn();
    render(<AddMindmapNodeDialog selected={undefined} hasRoot={false} sidesApply onAdd={onAdd} onClose={vi.fn()} />);
    expect(screen.queryByLabelText("Branch side")).toBeNull();
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Add node" }));
    expect(onAdd.mock.calls[0]![1]).toBe("root");
  });

  it("starts as a sibling when asked, and hides the side where sides mean nothing", () => {
    render(
      <AddMindmapNodeDialog
        selected={document.nodes[1]}
        hasRoot
        sidesApply={false}
        initialPosition="sibling"
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("Position") as HTMLSelectElement).value).toBe("sibling");
    expect(screen.queryByLabelText("Branch side")).toBeNull();
  });

  it("is blocked, with the reason, for a Markdown-form document", () => {
    const onAdd = vi.fn();
    render(
      <AddMindmapNodeDialog
        selected={document.nodes[0]}
        hasRoot
        sidesApply
        blocker="Convert to * markers to edit visually"
        onAdd={onAdd}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Convert to * markers");
    expect((screen.getByRole("button", { name: "Add node" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
