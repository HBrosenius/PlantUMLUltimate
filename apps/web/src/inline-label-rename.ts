import type { DiagramKind } from "./model";
import type { SemanticRenameRequest, SemanticSymbolProvider } from "./semantic-symbol-provider";

/** Only explicit label declarations qualify: aliases and reference text are never inline targets. */
export function inlineLabelRenameRequest(
  provider: SemanticSymbolProvider,
  kind: DiagramKind,
  id: string,
): SemanticRenameRequest | undefined {
  const supported =
    kind === "class" || kind === "component"
      ? ["class-entity", "class-package"]
      : kind === "usecase"
        ? ["actor", "usecase", "usecase-package"]
        : kind === "activity"
          ? ["activity-action", "activity-partition"]
          : [];
  const occurrence = provider.occurrences.find(
    (item) =>
      item.key === id &&
      supported.includes(item.kind) &&
      item.role === "declaration" &&
      (!("declaration" in item) || item.declaration !== "alias"),
  );
  if (
    occurrence &&
    provider.occurrences.some(
      (item) =>
        item.role === "declaration" &&
        item.kind === occurrence.kind &&
        item.key !== occurrence.key &&
        item.value === occurrence.value &&
        (!("declaration" in item) || item.declaration !== "alias"),
    )
  )
    return undefined;
  const request = occurrence ? provider.renameRequest(occurrence) : undefined;
  return request?.mode.endsWith(" alias") ? undefined : request;
}
