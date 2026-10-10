// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { InspectorSection } from "./InspectorSection";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("remembers optional sections and reveals invalid fields even when collapsed", async () => {
  const content = (
    <InspectorSection title="Resources" defaultOpen={false} rememberKey="test">
      <input aria-label="Allocation" type="number" min="0" max="100" defaultValue="50" />
    </InspectorSection>
  );
  const view = render(content);
  const details = screen.getByText("Resources").closest("details")!;
  expect(details.open).toBe(false);
  fireEvent.click(screen.getByText("Resources"));
  expect(details.open).toBe(true);
  view.unmount();
  render(content);
  expect(screen.getByText("Resources").closest("details")!.open).toBe(true);
  fireEvent.click(screen.getByText("Resources"));
  fireEvent.input(screen.getByLabelText("Allocation"), { target: { value: "150" } });
  await waitFor(() => expect(screen.getByText("Resources").closest("details")!.open).toBe(true));
  expect(screen.getByText(/Check values/)).toBeInTheDocument();
});
