import { expect, it } from "vitest";
import { startupChooserPolicy } from "./startup-chooser-policy";
import { DEFAULT_SESSION, normalizeSession } from "./workspace-storage";

it("offers creation for the untouched first-run welcome diagram", () => {
  expect(startupChooserPolicy(DEFAULT_SESSION)).toBe("replace-welcome");
});
it("restores recovered work by default, including edits to the welcome diagram", () => {
  expect(
    startupChooserPolicy({ ...DEFAULT_SESSION, documents: [{ ...DEFAULT_SESSION.documents[0]!, dirty: true }] }),
  ).toBeUndefined();
  expect(
    startupChooserPolicy({
      ...DEFAULT_SESSION,
      documents: [{ ...DEFAULT_SESSION.documents[0]!, historyId: "real-work" }],
    }),
  ).toBeUndefined();
});
it("never replaces restored diagrams when the chooser preference is enabled", () => {
  const work = { ...DEFAULT_SESSION.documents[0]!, historyId: "real-work" };
  expect(startupChooserPolicy({ ...DEFAULT_SESSION, startupMode: "chooser", documents: [work] })).toBe("add-diagram");
  expect(
    startupChooserPolicy({
      ...DEFAULT_SESSION,
      startupMode: "chooser",
      documents: [DEFAULT_SESSION.documents[0]!, work],
    }),
  ).toBe("add-diagram");
});
it("persists the preference and defaults older or invalid preferences to restore", () => {
  expect(normalizeSession({ ...DEFAULT_SESSION, startupMode: "chooser" }).startupMode).toBe("chooser");
  const { startupMode: _startupMode, ...older } = DEFAULT_SESSION;
  expect(normalizeSession(older).startupMode).toBe("restore");
  expect(normalizeSession({ ...DEFAULT_SESSION, startupMode: "invalid" }).startupMode).toBe("restore");
});
