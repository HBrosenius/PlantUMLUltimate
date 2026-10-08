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
