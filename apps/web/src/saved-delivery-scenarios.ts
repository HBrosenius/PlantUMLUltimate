import type { ResourceCapacity } from "./ResourceWorkloadPanel";
import { diagnosticsForDiagram } from "./diagram-diagnostics";

export const SAVED_SCENARIOS_KEY = "plantuml-studio.delivery-scenarios.v1";
export interface SavedDeliveryScenario {
  id: string;
  documentId: string;
  name: string;
  assumptions: string;
  baseSource: string;
  source: string;
  capacities: ResourceCapacity;
  updatedAt: string;
}
export function capacityRevision(capacities: ResourceCapacity): string {
  return JSON.stringify(Object.entries(capacities).sort(([a], [b]) => a.localeCompare(b)));
}
export function validateScenarioSource(source: string): void {
  if (source.length > 500_000 || source.split("\n").length > 5000)
    throw new Error("Keep each scenario source below 500,000 characters and 5,000 lines.");
  if (!/^\s*@startgantt\b/m.test(source) || !/^\s*@endgantt\b/m.test(source))
    throw new Error("A scenario must contain a complete Gantt diagram.");
  const error = diagnosticsForDiagram("gantt", source).find((item) => item.severity === "error");
  if (error) throw new Error(`Correct the scenario source: ${error.message}`);
}
function checked(value: unknown): SavedDeliveryScenario {
  if (!value || typeof value !== "object") throw new Error("Invalid saved scenario.");
  const item = value as SavedDeliveryScenario;
  if (
    typeof item.id !== "string" ||
    !item.id ||
    typeof item.documentId !== "string" ||
    !item.documentId ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    item.name.length > 100 ||
    typeof item.assumptions !== "string" ||
    item.assumptions.length > 2000 ||
    typeof item.baseSource !== "string" ||
    typeof item.source !== "string" ||
    typeof item.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(item.updatedAt)) ||
    !item.capacities ||
    typeof item.capacities !== "object" ||
    Array.isArray(item.capacities) ||
    Object.entries(item.capacities).some(
      ([name, capacity]) => !name || typeof capacity !== "number" || !Number.isFinite(capacity) || capacity < 0,
    )
  )
    throw new Error("Invalid saved scenario name, assumptions or metadata.");
  validateScenarioSource(item.baseSource);
  validateScenarioSource(item.source);
  return {
    id: item.id,
    documentId: item.documentId,
    name: item.name.trim(),
    assumptions: item.assumptions,
    baseSource: item.baseSource,
    source: item.source,
    capacities: { ...item.capacities },
    updatedAt: item.updatedAt,
  };
}
export function loadSavedScenarios(): SavedDeliveryScenario[] {
  const text = localStorage.getItem(SAVED_SCENARIOS_KEY);
  if (!text) return [];
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("Scenario library exceeds the 2 MB limit.");
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.scenarios) || data.scenarios.length > 20)
    throw new Error("Invalid saved scenario library.");
  const result = data.scenarios.map(checked) as SavedDeliveryScenario[];
  if (new Set(result.map((item) => item.id)).size !== result.length) throw new Error("Duplicate saved scenario IDs.");
  return result;
}
function write(entries: SavedDeliveryScenario[]): SavedDeliveryScenario[] {
  if (entries.length > 20) throw new Error("Keep at most 20 saved scenarios. Delete one before saving another.");
  const text = JSON.stringify({ version: 1, scenarios: entries });
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("Scenario library exceeds the 2 MB limit.");
  try {
    localStorage.setItem(SAVED_SCENARIOS_KEY, text);
  } catch {
    throw new Error("The browser could not save scenarios. Enable browser storage or free some space and try again.");
  }
  return entries;
}
export function saveDeliveryScenario(
  value: Omit<SavedDeliveryScenario, "id" | "updatedAt">,
  id?: string,
): SavedDeliveryScenario {
  const entries = loadSavedScenarios();
  const existing = id && entries.find((item) => item.id === id);
  if (id && (!existing || existing.documentId !== value.documentId))
    throw new Error("This saved scenario is no longer available. Save a new scenario instead.");
  const saved = checked({ ...value, id: id ?? crypto.randomUUID(), updatedAt: new Date().toISOString() });
  write([...entries.filter((item) => item.id !== saved.id), saved]);
  return saved;
}
export function deleteDeliveryScenario(id: string, documentId: string): void {
  const entries = loadSavedScenarios();
  write(entries.filter((item) => item.id !== id || item.documentId !== documentId));
}
