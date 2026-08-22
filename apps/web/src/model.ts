export type ViewMode = "code" | "split" | "diagram";
export type Theme = "light" | "dark" | "system";
export type RenderStatus = "idle" | "rendering" | "error";
export type DiagramKind = "gantt" | "sequence";

export interface RenderRequest {
  requestId: number;
  source: string;
}

export interface RenderResult {
  requestId: number;
  svg?: string | undefined;
  durationMs: number;
  error?: string | undefined;
}

export const DEFAULT_SOURCE = `@startgantt

Project starts 2026-09-01
saturday are closed
sunday are closed

[Architecture] starts 2026-09-01
[Architecture] lasts 4 days

[Backend] starts 2026-09-05
[Backend] lasts 8 days

[Frontend] starts 2026-09-05
[Frontend] lasts 10 days

[Testing] starts 2026-09-13
[Testing] lasts 5 days

@endgantt`;

export const DEFAULT_SEQUENCE_SOURCE = `@startuml
participant User
participant System

User -> System: Request
System --> User: Response
@enduml`;
