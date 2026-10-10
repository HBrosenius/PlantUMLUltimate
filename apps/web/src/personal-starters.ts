import { applySourceEdits, parseGantt, setTaskLinks, setTaskResources } from "@plantuml-studio/diagram-gantt";
import { diagnosticsForDiagram } from "./diagram-diagnostics";
import { detectDiagramKind } from "./diagram-kind";
import { importedDiagramKind } from "./import-source";
import type { DiagramKind } from "./model";

export const PERSONAL_STARTERS_KEY = "plantuml-studio.personal-starters.v1";
const kinds: DiagramKind[] = ["gantt", "wbs", "sequence", "class", "component", "activity", "usecase"];
export interface PersonalStarter {
  id: string;
  title: string;
  description: string;
  kind: DiagramKind;
  source: string;
}
export interface StarterChoices {
  keepResources: boolean;
  keepLinks: boolean;
  projectStart: string;
}
export const defaultStarterChoices: StarterChoices = { keepResources: true, keepLinks: true, projectStart: "" };

export function validateStarterSource(kind: DiagramKind, source: string) {
  const detected = importedDiagramKind(source);
  if ((kind === "gantt" || kind === "wbs" || detected === "gantt" || detected === "wbs") && kind !== detected)
    throw new Error("The starter type does not match its PlantUML source.");
  const explicitKind = detectDiagramKind(source);
  if (explicitKind && explicitKind !== kind) throw new Error("The starter type does not match its PlantUML source.");
  const error = diagnosticsForDiagram(kind, source).find((item) => item.severity === "error");
  if (error) throw new Error(`Correct the starter source before saving or creating: ${error.message}`);
}

function checked(value: unknown): Omit<PersonalStarter, "id"> {
  if (!value || typeof value !== "object") throw new Error("Invalid starter entry.");
  const item = value as Record<string, unknown>;
  if (
    typeof item.title !== "string" ||
    !item.title.trim() ||
    item.title.length > 100 ||
    typeof item.description !== "string" ||
    item.description.length > 2000 ||
    !kinds.includes(item.kind as DiagramKind) ||
    typeof item.source !== "string"
  )
    throw new Error("Invalid starter name, description, type, or source.");
  validateStarterSource(item.kind as DiagramKind, item.source);
  return {
    title: item.title.trim(),
    description: item.description,
    kind: item.kind as DiagramKind,
    source: item.source,
  };
}

function decode(text: string, preserveIds = false): PersonalStarter[] {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("Starter library exceeds the 2 MB limit.");
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object") throw new Error("Invalid starter library.");
  const envelope = data as Record<string, unknown>;
  if (
    envelope.format !== "plantuml-ultimate-starters" ||
    envelope.version !== 1 ||
    !Array.isArray(envelope.starters) ||
    envelope.starters.length > 30
  )
    throw new Error("Choose a version 1 PlantUML Ultimate starter library with at most 30 starters.");
  return envelope.starters.map((entry) => ({
    ...checked(entry),
    id: preserveIds && typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
  }));
}

export function loadPersonalStarters(): PersonalStarter[] {
  const text = localStorage.getItem(PERSONAL_STARTERS_KEY);
  if (!text) return [];
  return decode(text, true);
}

export function exportPersonalStarters(entries: readonly PersonalStarter[]): string {
  return JSON.stringify(
    {
      format: "plantuml-ultimate-starters",
      version: 1,
      starters: entries.map(({ title, description, kind, source }) => ({ title, description, kind, source })),
    },
    null,
    2,
  );
}

function write(entries: PersonalStarter[]): PersonalStarter[] {
  if (entries.length > 30) throw new Error("Keep at most 30 personal starters. Remove one before adding more.");
  const text = JSON.stringify({ format: "plantuml-ultimate-starters", version: 1, starters: entries });
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("Starter library exceeds the 2 MB limit.");
  try {
    localStorage.setItem(PERSONAL_STARTERS_KEY, text);
  } catch {
    throw new Error(
      "The browser could not save the starter library. Free storage space or enable browser storage, then try again.",
    );
  }
  return entries;
}

export function savePersonalStarter(value: Omit<PersonalStarter, "id">): PersonalStarter[] {
  return write([...loadPersonalStarters(), { ...checked(value), id: crypto.randomUUID() }]);
}
export function removePersonalStarter(id: string): PersonalStarter[] {
  return write(loadPersonalStarters().filter((entry) => entry.id !== id));
}
export function importPersonalStarters(text: string): PersonalStarter[] {
  const imported = decode(text); // Validate every entry before changing the stored library.
  return write([...loadPersonalStarters(), ...imported]);
}

export function prepareStarterSource(kind: DiagramKind, source: string, choices: StarterChoices): string {
  let next = source;
  if (kind === "gantt") {
    const ids = parseGantt(next).document.tasks.map((task) => task.id);
    for (const id of choices.keepResources && choices.keepLinks ? [] : ids) {
      let task = parseGantt(next).document.symbols.tasks.get(id)!;
      if (!choices.keepResources && task.resources?.length) {
        const operation = setTaskResources(next, task, []);
        if (operation.unavailableReason) throw new Error(operation.unavailableReason);
        next = applySourceEdits(next, operation.edits);
      }
      task = parseGantt(next).document.symbols.tasks.get(id)!;
      if (!choices.keepLinks && task.links?.length) {
        const operation = setTaskLinks(next, task, []);
        if (operation.unavailableReason) throw new Error(operation.unavailableReason);
        next = applySourceEdits(next, operation.edits);
      }
    }
    if (choices.projectStart) {
      const start = parseGantt(next).document.projectStart;
      if (!start)
        throw new Error("Add a Project starts declaration in the source before choosing a new project start.");
      next = applySourceEdits(next, [{ range: start.range, text: choices.projectStart }]);
    }
  }
  validateStarterSource(kind, next);
  return next;
}
