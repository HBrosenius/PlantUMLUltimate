// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectNameDialog } from "./ProjectNameDialog";
import { ProjectUnlockDialog } from "./ProjectUnlockDialog";

afterEach(cleanup);

describe("project dialogs", () => {
  it("submits a trimmed project name", () => {
    const onSubmit = vi.fn();
    render(
      <ProjectNameDialog
        title="New project"
        initialValue="PlantUML project"
        submitLabel="Create project"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  Roadmap  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(onSubmit).toHaveBeenCalledWith("Roadmap");
  });

  it("keeps passwords private and supports explicit cancellation", () => {
    const onUnlock = vi.fn();
    const onClose = vi.fn();
    render(<ProjectUnlockDialog fileName="roadmap.pumlu" onUnlock={onUnlock} onClose={onClose} />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(onUnlock).toHaveBeenCalledWith("secret");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
