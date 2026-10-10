// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddMenu } from "./AddMenu";
import { FileMenu } from "./FileMenu";

afterEach(cleanup);

const actions = () => ({
  onTask: vi.fn(),
  onMilestone: vi.fn(),
  onDivider: vi.fn(),
  onClosedDay: vi.fn(),
  onParticipant: vi.fn(),
  onMessage: vi.fn(),
  onFragment: vi.fn(),
  onActivation: vi.fn(),
  onNote: vi.fn(),
  onSequenceSpacing: vi.fn(),
  onReference: vi.fn(),
  onParticipantBox: vi.fn(),
  onUseCaseActor: vi.fn(),
  onUseCase: vi.fn(),
  onUseCaseRelationship: vi.fn(),
  onUseCasePackage: vi.fn(),
  onUseCaseNote: vi.fn(),
  onClassEntity: vi.fn(),
  onClassRelationship: vi.fn(),
  onClassPackage: vi.fn(),
  onClassNote: vi.fn(),
  onActivityAction: vi.fn(),
  onActivityPartition: vi.fn(),
  onActivityNote: vi.fn(),
  onActivityStructure: vi.fn(),
  onActivityTerminal: vi.fn(),
  onActivityArrow: vi.fn(),
  onWbsNode: vi.fn(),
});

const fileActions = (): Omit<ComponentProps<typeof FileMenu>, "canExport"> => ({
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onVersionHistory: vi.fn(),
  onBackup: vi.fn(),
  onRestore: vi.fn(),
  onExportSource: vi.fn(),
  onExportSvg: vi.fn(),
  onExportPng: vi.fn(),
  onExportPdf: vi.fn(),
  onCopyImage: vi.fn(),
  onCopyMarkdown: vi.fn(),
  onCopyConfluence: vi.fn(),
});

describe("application menus", () => {
  it("opens Add from the keyboard, cycles through its items, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    const callbacks = actions();
    render(<AddMenu diagramKind="gantt" {...callbacks} />);
    const trigger = screen.getByRole("button", { name: "Add" });

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(await screen.findByRole("menu", { name: "Add" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /^Task…/ })).toHaveFocus());

    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: /Closed day/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Milestone/ })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Add" })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("exposes File and Export as nested menus and skips disabled export actions", async () => {
    const user = userEvent.setup();
    render(<FileMenu canExport={false} {...fileActions()} />);
    const trigger = screen.getByRole("button", { name: "File" });

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "New" })).toHaveFocus());
    await user.keyboard("{ArrowUp}");
    const exportItem = screen.getByRole("menuitem", { name: "Export" });
    expect(exportItem).toHaveFocus();
    expect(exportItem).toHaveAttribute("aria-haspopup", "menu");
    expect(exportItem).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{ArrowRight}");
    expect(await screen.findByRole("menu", { name: "Export" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Source" })).toHaveFocus());
    expect(screen.getByRole("menuitem", { name: "SVG" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "PNG" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "PDF" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Copy image" })).toBeDisabled();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Copy as Markdown" })).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Source" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(exportItem).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "New" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("runs the PDF and clipboard export actions from the Export submenu", async () => {
    const user = userEvent.setup();
    const callbacks = fileActions();
    render(<FileMenu canExport {...callbacks} />);

    for (const [name, callback] of [
      ["PDF", callbacks.onExportPdf],
      ["Copy image", callbacks.onCopyImage],
      ["Copy as Markdown", callbacks.onCopyMarkdown],
      ["Copy for Confluence", callbacks.onCopyConfluence],
    ] as const) {
      await user.click(screen.getByRole("button", { name: "File" }));
      await user.click(screen.getByRole("menuitem", { name: "Export" }));
      await user.click(await screen.findByRole("menuitem", { name }));
      expect(callback).toHaveBeenCalledOnce();
    }
    await user.click(screen.getByRole("button", { name: "File" }));
    await user.click(screen.getByRole("menuitem", { name: "Export" }));
    expect(screen.getByRole("menuitem", { name: "Copy for Confluence" })).toHaveAttribute(
      "title",
      expect.stringContaining("PlantUML for Confluence macro"),
    );
  });

  it("keeps planning actions out of File", async () => {
    const user = userEvent.setup();
    render(<FileMenu canExport {...fileActions()} />);
    await user.click(screen.getByRole("button", { name: "File" }));
    expect(screen.queryByRole("menuitem", { name: /scenario|Jira/i })).not.toBeInTheDocument();
  });
});
