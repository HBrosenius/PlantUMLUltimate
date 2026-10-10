export interface WbsGanttProjectLink {
  id: string;
  missingWbsNode?: boolean;
  missingGanttTask?: boolean;
  wbsLabel: string;
  ganttLabel: string;
  wbsDiagramName: string;
  ganttDiagramName: string;
  wbsDocumentId: string;
  ganttDocumentId: string;
  wbsNodeId: string;
  ganttTaskId: string;
}
