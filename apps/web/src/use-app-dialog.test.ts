import { describe, expect, it } from "vitest";
import { appDialogReducer } from "./use-app-dialog";

describe("app dialog transitions", () => {
  it("keeps at most one primary dialog open", () => {
    const task = appDialogReducer(undefined, { type: "open", dialog: { kind: "add-task" } });
    expect(appDialogReducer(task, { type: "open", dialog: { kind: "help" } })).toEqual({ kind: "help" });
  });

  it("keeps new-document replacement intent with the dialog", () => {
    expect(
      appDialogReducer(undefined, {
        type: "open",
        dialog: { kind: "new-document", replaceActiveDocument: true },
      }),
    ).toEqual({ kind: "new-document", replaceActiveDocument: true });
  });

  it("ignores a stale close request from a replaced dialog", () => {
    const help = { kind: "help" } as const;
    expect(appDialogReducer(help, { type: "close", kind: "add-task" })).toBe(help);
  });

  it("toggles the command palette without boolean state combinations", () => {
    const open = appDialogReducer(undefined, { type: "toggle-command-palette" });
    expect(open).toEqual({ kind: "command-palette" });
    expect(appDialogReducer(open, { type: "toggle-command-palette" })).toBeUndefined();
  });
});
