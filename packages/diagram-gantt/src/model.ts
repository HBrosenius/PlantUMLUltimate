export interface TextRange {
  from: number;
  to: number;
}

export interface SourceValue<T> {
  value: T;
  range: TextRange;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  range: TextRange;
  code: string;
}

export interface DurationExpression extends SourceValue<number> {
  unit: "day" | "week" | "month";
  sourceParts?: { weeks: number; days: number };
}

export interface DateExpression extends SourceValue<string> {
  resolved: boolean;
}

export interface TaskReference extends SourceValue<string> {}

export interface GanttNote {
  text: string;
  position: "bottom" | "top" | "left" | "right";
  sourceRange: TextRange;
}

export interface GanttDivider {
  label: string;
  sourceRange: TextRange;
}

export interface TaskDeclaration {
  kind:
    | "duration"
    | "start"
    | "end"
    | "completion"
    | "milestone"
    | "color"
    | "resource"
    | "pause"
    | "same-row"
    | "modifier"
    | "unknown";
  range: TextRange;
  inline?: boolean;
}

export interface GanttTask {
  id: string;
  label: string;
  labelRange: TextRange;
  alias?: SourceValue<string>;
  sourceRange: TextRange;
  declarations: TaskDeclaration[];
  start?: DateExpression;
  end?: DateExpression;
  duration?: DurationExpression;
  completion?: SourceValue<number>;
  color?: SourceValue<string>;
  milestone?: TaskReference | DateExpression;
  resources?: Array<SourceValue<string> & { allocation?: number }>;
  pauses?: DateExpression[];
  sameRowTaskId?: string;
  sameRowAs?: TaskReference;
  notes?: GanttNote[];
}

export interface GanttDependency {
  predecessorTaskId: string;
  successorTaskId: string;
  predecessor: TaskReference;
  successor: TaskReference;
  relation: "start-after-end" | "start-after-start" | "end-after-end" | "end-after-start" | "other";
  offset?: SourceValue<number>;
  direction?: "after" | "before";
  color?: SourceValue<string>;
  lineStyle?: SourceValue<"solid" | "dotted" | "dashed" | "bold">;
  sourceRange: TextRange;
  notes?: GanttNote[];
}

export interface UnknownSyntaxNode {
  kind: "unknown";
  text: string;
  range: TextRange;
}

export interface GanttSymbolTable {
  tasks: Map<string, GanttTask>;
  references: Map<string, string>;
}

export interface GanttDocument {
  sourceRange: TextRange;
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  dividers: GanttDivider[];
  unknown: UnknownSyntaxNode[];
  projectStart?: DateExpression;
  symbols: GanttSymbolTable;
}

export interface ParseResult {
  document: GanttDocument;
  diagnostics: Diagnostic[];
}

export function findTaskAt(document: GanttDocument, position: number): GanttTask | undefined {
  return document.tasks.find((task) =>
    task.declarations.some((item) => position >= item.range.from && position <= item.range.to),
  );
}
