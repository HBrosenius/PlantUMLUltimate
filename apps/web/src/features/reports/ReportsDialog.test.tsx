// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportsDialog } from "./ReportsDialog";
import { copyReport } from "./report-clipboard";
vi.mock("./report-clipboard", () => ({
  copyReport: vi.fn().mockResolvedValue(undefined),
  copyPlain: vi.fn().mockResolvedValue(undefined),
  copyChart: vi.fn().mockResolvedValue(undefined),
}));
const source =
  "@startgantt\n[A] on {Alice} starts 2026-10-01\n[A] lasts 3 days\n[B] on {Bob} starts 2026-10-01\n[B] lasts 3 days\n@endgantt";
const props = {
  source,
  sourceIdentity: "doc",
  documentName: "Document",
  diagramName: "Roadmap",
  timeZone: "Europe/Stockholm",
  onClose: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});
describe("reports builder", () => {
  it("starts forecast reports with saved status date and estimates, and blocks exports when estimates change", async () => {
    const forecastSettings = { asOf: "2026-10-08", remainingDays: { a: 7 } };
    const view = render(<ReportsDialog {...props} forecastSettings={forecastSettings} />);
    fireEvent.change(screen.getByLabelText("Report type"), { target: { value: "forecast" } });
    expect((screen.getByLabelText("As-of date") as HTMLInputElement).value).toBe("2026-10-08");
    expect((screen.getByLabelText("Report text") as HTMLTextAreaElement).value).toContain(
      "7 working days (saved estimate)",
    );
    const copy = screen.getByRole("button", { name: "Copy for email" }) as HTMLButtonElement;
    await waitFor(() => expect(copy.disabled).toBe(false));
    view.rerender(<ReportsDialog {...props} forecastSettings={{ ...forecastSettings, remainingDays: { a: 8 } }} />);
    expect(copy.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));
    await waitFor(() => expect(copy.disabled).toBe(false));
    expect((screen.getByLabelText("Report text") as HTMLTextAreaElement).value).toContain(
      "8 working days (saved estimate)",
    );
  });
  it("does not record observations when changing report types or rendering a preview", () => {
    const record = vi.fn();
    render(<ReportsDialog {...props} onRecordProgress={record} />);
    fireEvent.change(screen.getByLabelText("Report type"), { target: { value: "history" } });
    expect(record).not.toHaveBeenCalled();
  });
  it("remembers wording across reopening and saves restored defaults", () => {
    const first = render(<ReportsDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Introduction"), { target: { value: "Please send your update." } });
    fireEvent.change(screen.getByLabelText("Sign-off"), { target: { value: "Tack,\nHenri" } });
    first.unmount();
    const second = render(<ReportsDialog {...props} />);
    expect((screen.getByLabelText("Introduction") as HTMLTextAreaElement).value).toBe("Please send your update.");
    expect((screen.getByLabelText("Sign-off") as HTMLTextAreaElement).value).toBe("Tack,\nHenri");
    fireEvent.click(screen.getByRole("button", { name: "Restore default wording" }));
    const restored = (screen.getByLabelText("Introduction") as HTMLTextAreaElement).value;
    second.unmount();
    render(<ReportsDialog {...props} />);
    expect((screen.getByLabelText("Introduction") as HTMLTextAreaElement).value).toBe(restored);
    expect(restored).not.toBe("Please send your update.");
  });
  it("keeps intentionally empty wording across reopening", () => {
    const view = render(<ReportsDialog {...props} />);
    fireEvent.change(screen.getByLabelText("Sign-off"), { target: { value: "" } });
    view.unmount();
    render(<ReportsDialog {...props} />);
    expect((screen.getByLabelText("Sign-off") as HTMLTextAreaElement).value).toBe("");
  });
  it("copies only the visible recipient and invalidates copied state on option changes", async () => {
    render(<ReportsDialog {...props} />);
    const copy = screen.getByRole("button", { name: "Copy for email" });
    await waitFor(() => expect((copy as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(copy);
    await waitFor(() => expect(copyReport).toHaveBeenCalled());
    expect(vi.mocked(copyReport).mock.calls[0]![1]).toContain("Hi Alice");
    expect(vi.mocked(copyReport).mock.calls[0]![1]).not.toContain("[b]");
    await waitFor(() => expect(screen.getByRole("option", { name: /Alice.*Copied/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Introduction"), { target: { value: "New request" } });
    expect(screen.queryByRole("option", { name: /Copied/ })).toBeNull();
  });
  it("blocks stale exports until an explicit refresh", async () => {
    const view = render(<ReportsDialog {...props} />);
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Copy for email" }) as HTMLButtonElement).disabled).toBe(false),
    );
    view.rerender(<ReportsDialog {...props} source={source.replace("[A] lasts 3", "[A] lasts 4")} />);
    expect((screen.getByRole("button", { name: "Copy for email" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Copy for email" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });
});

it("opens Issues and preserves report options while the dialog is suspended", () => {
  const onOpenIssues = vi.fn();
  const invalid = { ...props, source: "@startgantt\n[A] lasts -2 days\n@endgantt", onOpenIssues };
  const view = render(<ReportsDialog {...invalid} />);
  fireEvent.change(screen.getByLabelText("Introduction"), { target: { value: "Keep my report draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Open Issues" }));
  expect(onOpenIssues).toHaveBeenCalledOnce();
  view.rerender(<ReportsDialog {...invalid} suspended />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(props.onClose).not.toHaveBeenCalled();
  view.rerender(<ReportsDialog {...invalid} source={source} />);
  expect((screen.getByLabelText("Introduction") as HTMLTextAreaElement).value).toBe("Keep my report draft");
});

it("offers an explicit coordinator preset for unassigned work without changing the source", () => {
  const unassigned = "@startgantt\n[A] starts 2099-10-01\n[A] lasts 3 days\n@endgantt";
  render(<ReportsDialog {...props} source={unassigned} documentName="Roadmap" />);
  expect(screen.getByText(/No people are assigned/)).toBeTruthy();
  expect((screen.getByLabelText("Report type") as HTMLSelectElement).value).toBe("check-in");
  expect(document.querySelector(".reports-source")?.textContent).toBe("Roadmap");
  fireEvent.click(screen.getByRole("button", { name: "Create coordinator summary" }));
  expect((screen.getByLabelText("Report text") as HTMLTextAreaElement).value).toContain("A");
  expect((screen.getByLabelText("Output") as HTMLSelectElement).value).toBe("combined");
  expect((screen.getByLabelText("Tasks") as HTMLSelectElement).value).toBe("All tasks");
  fireEvent.click(screen.getByLabelText("A", { selector: "input" }));
  expect(screen.getByText("All candidate tasks are individually excluded.")).toBeTruthy();
});

it("distinguishes dates from individual exclusions and restores the selected scope", () => {
  render(<ReportsDialog {...props} />);
  fireEvent.change(screen.getByLabelText("As-of date"), { target: { value: "2026-09-01" } });
  expect(screen.getByText(/No tasks match the selected dates/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Coordinator summary · all tasks" }));
  fireEvent.click(screen.getByLabelText("A", { selector: "input" }));
  fireEvent.click(screen.getByLabelText("B", { selector: "input" }));
  expect(screen.getByText("All candidate tasks are individually excluded.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reset exclusions" }));
  expect(screen.getByLabelText("Report text")).toBeTruthy();
});
