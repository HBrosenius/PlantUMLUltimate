// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Command } from "@plantuml-studio/editor-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";

afterEach(cleanup);

const command = (id: string, overrides: Partial<Command> = {}): Command => ({
  id,
  label: id,
  category: "Test",
  run: vi.fn(),
  ...overrides,
});

describe("CommandPalette", () => {
  it("exposes the highlighted option through aria-activedescendant and skips disabled commands", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const commands = [
      command("disabled-first", { enabled: false }),
      command("alpha"),
      command("beta", { enabled: false }),
      command("gamma"),
    ];
    const onClose = vi.fn();
    render(<CommandPalette commands={commands} onClose={onClose} />);

    const input = screen.getByRole("combobox", { name: "Search commands" });
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    // The first enabled command is highlighted initially.
    expect(input).toHaveAttribute("aria-activedescendant", options[1]!.id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", options[3]!.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", options[3]!.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", options[1]!.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", options[1]!.id);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[3]!.run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("does not run anything on Enter when every match is disabled", () => {
    const commands = [command("only", { enabled: false })];
    const onClose = vi.fn();
    render(<CommandPalette commands={commands} onClose={onClose} />);
    const input = screen.getByRole("combobox");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands[0]!.run).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
