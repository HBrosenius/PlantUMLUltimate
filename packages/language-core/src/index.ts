export interface TextRange {
  from: number;
  to: number;
}
export interface SourceEdit {
  range: TextRange;
  text: string;
}

export interface LanguageDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  range: TextRange;
  code: string;
}

export interface LanguageCompletion {
  label: string;
  insertText: string;
  detail?: string;
  kind: "keyword" | "task" | "date" | "resource" | "property" | "snippet";
}

export interface CompletionRequest {
  source: string;
  position: number;
  explicit: boolean;
}

export interface InteractiveObject {
  id: string;
  kind: string;
  label: string;
  sourceRange: TextRange;
}

export interface VisualOperation {
  kind: string;
  [key: string]: unknown;
}
export interface VisualOperationResult {
  edits: SourceEdit[];
  unavailableReason?: string;
}

export interface DiagramParseResult<TModel> {
  document: TModel;
  diagnostics: readonly LanguageDiagnostic[];
}

export interface DiagramCapabilities {
  visualSelection: boolean;
  visualMove: boolean;
  visualResize: boolean;
  visualDependencies: boolean;
}

export interface DiagramAdapter<TModel, TOperation extends VisualOperation = VisualOperation> {
  id: string;
  displayName: string;
  capabilities: DiagramCapabilities;
  detect(source: string): boolean;
  parse(source: string): DiagramParseResult<TModel>;
  completions(request: CompletionRequest, model: TModel): readonly LanguageCompletion[];
  diagnostics(model: TModel): readonly LanguageDiagnostic[];
  interactiveObjects(model: TModel): readonly InteractiveObject[];
  applyVisualOperation(operation: TOperation, model: TModel, source: string): VisualOperationResult;
}
