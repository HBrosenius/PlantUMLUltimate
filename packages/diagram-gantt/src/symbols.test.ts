import { expect, it } from "vitest";
import { parseGantt } from "./parser";
import { ganttSymbolOccurrences, taskOccurrences } from "./symbols";

it("indexes aliases, dependencies, resources and separators without indexing comments", () => {
  const source = `@startgantt
[Design UI] as [design] starts 2026-09-01
[Design UI] lasts 2 days and is assigned to {Alice:50%, Bob}
[Build] starts at [design]'s end and lasts 3 days
separator just at [design]'s end
' [Design UI] and {Ghost} are only a comment
@endgantt`;
  const document = parseGantt(source).document;
  const occurrences = ganttSymbolOccurrences(source, document);
  expect(occurrences.map(({ kind, key, value, role }) => ({ kind, key, value, role }))).toEqual([
    { kind: "task", key: "design", value: "Design UI", role: "declaration" },
    { kind: "task", key: "design", value: "design", role: "reference" },
    { kind: "task", key: "design", value: "Design UI", role: "reference" },
    { kind: "task", key: "design", value: "design", role: "reference" },
    { kind: "task", key: "design", value: "design", role: "reference" },
    { kind: "task", key: "build", value: "Build", role: "declaration" },
    { kind: "person", key: "alice", value: "Alice", role: "reference" },
    { kind: "person", key: "bob", value: "Bob", role: "reference" },
  ]);
  for (const occurrence of occurrences)
    expect(source.slice(occurrence.range.from, occurrence.range.to)).toBe(occurrence.value);
  expect(taskOccurrences(source, document, document.tasks[0]!)).toEqual(
    occurrences.filter((item) => item.key === "design"),
  );
});

it("indexes every task in a 1,000-task document exactly once", () => {
  const source = `@startgantt\n${Array.from({ length: 1000 }, (_, i) => `[Task ${i}] lasts 1 day`).join("\n")}\n@endgantt`;
  const occurrences = ganttSymbolOccurrences(source, parseGantt(source).document);
  expect(occurrences).toHaveLength(1000);
  expect(new Set(occurrences.map((item) => item.key)).size).toBe(1000);
  expect(occurrences.every((item) => item.role === "declaration")).toBe(true);
});
