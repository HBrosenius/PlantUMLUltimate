import type { DiagramQuickFix } from "./diagram-diagnostics";
import type { DiagramKind } from "./model";

export interface FixContext {
  source: string;
  kind: DiagramKind;
  documentId: string | undefined;
  revision: number;
}
export interface FixSnapshot extends FixContext {
  fixes: DiagramQuickFix[];
}

export function isCurrentFix(snapshot: FixSnapshot, current: FixContext, fix: DiagramQuickFix): boolean {
  return (
    snapshot.source === current.source &&
    snapshot.kind === current.kind &&
    snapshot.documentId === current.documentId &&
    snapshot.revision === current.revision &&
    snapshot.fixes.includes(fix) &&
    fix.from >= 0 &&
    fix.to >= fix.from &&
    fix.to <= current.source.length
  );
}
