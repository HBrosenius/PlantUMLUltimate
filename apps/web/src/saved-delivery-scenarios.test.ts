// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  deleteDeliveryScenario,
  loadSavedScenarios,
  saveDeliveryScenario,
  SAVED_SCENARIOS_KEY,
} from "./saved-delivery-scenarios";
const source = "@startgantt\n[Build] lasts 3 days\n@endgantt";
const input = {
  documentId: "doc-a",
  name: "Extra capacity",
  assumptions: "Add one engineer",
  baseSource: source,
  source: source.replace("3 days", "2 days"),
  capacities: { Alice: 100 },
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it("persists base, alternative, assumptions and capacities, updates in place and scopes deletion", () => {
  const entry = saveDeliveryScenario(input);
  expect(loadSavedScenarios()).toEqual([entry]);
  expect(entry).toMatchObject(input);
  saveDeliveryScenario({ ...input, name: "Updated", source: source.replace("3 days", "4 days") }, entry.id);
  expect(loadSavedScenarios()).toHaveLength(1);
  expect(loadSavedScenarios()[0]!.baseSource).toBe(source);
  expect(() => saveDeliveryScenario({ ...input, documentId: "doc-b" }, entry.id)).toThrow("no longer available");
  deleteDeliveryScenario(entry.id, "doc-b");
  expect(loadSavedScenarios()).toHaveLength(1);
  deleteDeliveryScenario(entry.id, "doc-a");
  expect(loadSavedScenarios()).toEqual([]);
});
it("rejects invalid source, metadata and capacity without changing saved entries", () => {
  saveDeliveryScenario(input);
  const before = localStorage.getItem(SAVED_SCENARIOS_KEY);
  for (const patch of [
    { name: "" },
    { assumptions: "a".repeat(2001) },
    { source: "@startgantt" },
    { capacities: { Alice: -1 } },
  ]) {
    expect(() => saveDeliveryScenario({ ...input, ...patch })).toThrow();
    expect(localStorage.getItem(SAVED_SCENARIOS_KEY)).toBe(before);
  }
});
it("keeps corrupt libraries intact and reports storage failure without claiming a save", () => {
  localStorage.setItem(SAVED_SCENARIOS_KEY, "broken");
  expect(() => saveDeliveryScenario(input)).toThrow();
  expect(localStorage.getItem(SAVED_SCENARIOS_KEY)).toBe("broken");
  localStorage.clear();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => saveDeliveryScenario(input)).toThrow("could not save");
  expect(loadSavedScenarios()).toEqual([]);
});
it("bounds saved alternatives and preserves unknown source statements", () => {
  const unsupported = source.replace("[Build]", "' Custom comment\ncustom renderer setting\n[Build]");
  for (let index = 0; index < 20; index++)
    saveDeliveryScenario({ ...input, name: `Alternative ${index}`, source: unsupported });
  expect(loadSavedScenarios()[0]!.source).toBe(unsupported);
  expect(() => saveDeliveryScenario(input)).toThrow("at most 20");
  expect(loadSavedScenarios()).toHaveLength(20);
});
