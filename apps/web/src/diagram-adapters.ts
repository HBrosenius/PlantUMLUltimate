import { ganttAdapter } from "@plantuml-studio/diagram-gantt";
import { wbsAdapter } from "@plantuml-studio/diagram-wbs";
import type { DiagramCapabilities } from "@plantuml-studio/language-core";
import { DiagramAdapterRegistry } from "@plantuml-studio/language-plantuml";

const registeredAdapters = {
  gantt: ganttAdapter,
  wbs: wbsAdapter,
} as const;

export type ApplicationDiagramAdapterId = keyof typeof registeredAdapters;

export const applicationDiagramAdapterRegistry = new DiagramAdapterRegistry()
  .register(registeredAdapters.gantt)
  .register(registeredAdapters.wbs);

export function getApplicationDiagramAdapter<K extends ApplicationDiagramAdapterId>(
  id: K,
): (typeof registeredAdapters)[K] {
  const adapter = applicationDiagramAdapterRegistry.get(id);
  if (!adapter) throw new Error(`Application diagram adapter “${id}” is not registered`);
  return adapter as (typeof registeredAdapters)[K];
}

export function sourceSupportsDiagramCapability(source: string, capability: keyof DiagramCapabilities): boolean {
  return applicationDiagramAdapterRegistry.detect(source)?.capabilities[capability] ?? false;
}

export const applicationGanttAdapter = getApplicationDiagramAdapter("gantt");
export const applicationWbsAdapter = getApplicationDiagramAdapter("wbs");
