// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryScenarioDialog } from "./DeliveryScenarioDialog";

afterEach(cleanup);

const source = `@startgantt
Project starts 2026-09-01
[Build] lasts 3 days
[Release] happens at [Build]'s end
@endgantt`;

describe("DeliveryScenarioDialog", () => {
  it("keeps the current plan immutable and updates impact from scenario edits", () => {
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={vi.fn()} />);

    expect((screen.getByLabelText("Current plan source") as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.getByText("Edit the scenario source to see delivery impact.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Scenario source"), {
      target: { value: source.replace("3 days", "5 days") },
    });
    expect(screen.getByRole("heading", { name: "Milestones" }).closest("section")?.textContent).toContain("+2 days");
    expect(screen.getByText(/Because:/).textContent).toContain("Changed duration");
  });

  it("resets the scenario and closes explicitly", () => {
    const onClose = vi.fn();
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={vi.fn()} onClose={onClose} />);
    const scenario = screen.getByLabelText("Scenario source") as HTMLTextAreaElement;
    fireEvent.change(scenario, { target: { value: source.replace("3 days", "7 days") } });
    fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));
    expect(scenario.value).toBe(source);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("requires source review before applying the scenario", () => {
    const onApply = vi.fn(() => true);
    render(<DeliveryScenarioDialog currentSource={source} capacities={{}} onApply={onApply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Scenario source"), {
      target: { value: source.replace("3 days", "5 days") },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByLabelText("Scenario source patch").textContent).toContain("[Build] lasts 5 days");
    expect(screen.getByLabelText("Scenario source patch").textContent).toContain("[Build] lasts 3 days");
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario" }));
    expect(onApply).toHaveBeenCalledWith(source.replace("3 days", "5 days"));
  });
});
