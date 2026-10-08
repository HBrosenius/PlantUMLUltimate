import type { GanttTask } from "@plantuml-studio/diagram-gantt";
export type TaskFilter = "Ongoing" | "All tasks" | "Upcoming" | "Overdue" | "Completed";
export const defaultIntroduction =
  "Could you confirm whether the tasks below are on track? Please reply with any progress or date changes, and flag blockers or support you need.";
export const defaultSignOff = "Thanks,";
export interface ReportOptions {
  locale?: string;
  asOf: string;
  timeZone: string;
  filter: TaskFilter;
  people: string[];
  excluded: string[];
  unresolved: boolean;
  milestones: boolean;
  combined: boolean;
  unassigned: boolean;
  notes: boolean;
  links: boolean;
  compact: boolean;
  chart: boolean;
  replyBy: string;
  introduction: string;
  signOff: string;
}
export interface ReportRow {
  task: GanttTask;
  start?: string | undefined;
  end?: string | undefined;
  completion: number | null;
  issue?: string | undefined;
  status: string;
  section: string;
  attention: boolean;
  shared: string[];
}
export interface ReportMessage {
  id: string;
  recipient: string;
  subject: string;
  rows: ReportRow[];
}
export interface ReportSnapshot {
  version: 1;
  sourceIdentity: string;
  generatedAt: string;
  documentName: string;
  diagramName: string;
  options: ReportOptions;
  messages: ReportMessage[];
  candidates: ReportRow[];
  recipients: Array<{ id: string; name: string; count: number; variants: string[] }>;
  uniqueTasks: number;
  assignments: number;
  unresolvedExcluded: number;
  warnings: string[];
}
