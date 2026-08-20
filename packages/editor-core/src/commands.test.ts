import { describe, expect, it, vi } from "vitest";
import { filterCommands, type Command } from "./commands";

const command = (id: string, label: string, category: string): Command => ({ id, label, category, run: vi.fn() });

describe("filterCommands", () => {
  const commands = [command("file.save-as", "Save As", "File"), command("view.diagram", "Diagram only", "View")];

  it("returns all commands for an empty query", () => expect(filterCommands(commands, " ")).toEqual(commands));
  it("matches labels, categories, and ids case-insensitively", () => {
    expect(filterCommands(commands, "SAVE")).toEqual([commands[0]]);
    expect(filterCommands(commands, "view diagram")).toEqual([commands[1]]);
  });
});
