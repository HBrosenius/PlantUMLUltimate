// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { GanttReviewDetails } from "./GanttReviewDetails";
import { buildReviewGroups } from "./semantic-review";
afterEach(cleanup);
it("shows the result of this group rather than unrelated changes to the same task", async () => {
  const before = "@startgantt\n[A] lasts 2 days\n\n[A] is 0% complete\n@endgantt";
  const after = before.replace("2 days", "3 days").replace("0%", "20%");
  const group = buildReviewGroups(before, after, "gantt")[0]!;
  render(<GanttReviewDetails group={group} before={before} />);
  await userEvent.click(screen.getByText("Review task fields"));
  await waitFor(() => expect(screen.getByRole("table").textContent).toContain("Duration"));
  expect(screen.getByRole("table").textContent).toContain("2 days");
  expect(screen.getByRole("table").textContent).toContain("3 days");
  expect(screen.queryByText("Progress (%)")).toBeNull();
});
