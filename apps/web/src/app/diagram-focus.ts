export function diagramFocusSelector(target: Element): string | undefined {
  for (const attribute of [
    "data-task-id",
    "data-sequence-participant-id",
    "data-usecase-object-id",
    "data-class-object-id",
    "data-activity-object-id",
    "data-wbs-node-id",
  ]) {
    const owner = target.closest(`[${attribute}]`);
    const value = owner?.getAttribute(attribute);
    if (value)
      return `[${attribute}="${CSS.escape(value)}"][tabindex], [${attribute}="${CSS.escape(value)}"] [tabindex]`;
  }
  return undefined;
}
