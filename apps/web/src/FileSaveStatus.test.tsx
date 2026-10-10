// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FileSaveStatus, type FileSaveState } from "./FileSaveStatus";
afterEach(cleanup);
it.each([
  [false, undefined, "new", "Not saved to a file"],
  [true, undefined, "new", "Unsaved changes"],
  [false, "saved", "file", "Saved to file"],
  [false, undefined, "file", "Saved to file"],
  [false, undefined, "download", "Download requested"],
  [true, "saved", "file", "Unsaved changes"],
  [true, "saving", "new", "Saving…"],
  [true, "error", "new", "Save failed"],
  [true, "cancelled", "new", "Save cancelled · Unsaved changes"],
] as const)("reports dirty=%s status=%s copy=%s accurately", (dirty, status, fileCopy, label) => {
  render(
    <FileSaveStatus
      dirty={dirty}
      fileCopy={fileCopy}
      state={status ? { documentId: "one", status: status as FileSaveState["status"] } : undefined}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain(label);
});
