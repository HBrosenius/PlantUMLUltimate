import type { ProjectElement, ProjectLink } from "@plantuml-studio/project-model";
import { useState } from "react";
import type { DiagramKind } from "../model";
import type { WbsGanttIssue } from "../wbs-gantt-health";
import type { WbsGanttProjectLink } from "./wbs-gantt-project-links";
import type { WbsGanttMissingItem } from "./wbs-gantt-missing";
import type { VirtualProject } from "./project-index";
import { ProjectLinksPanel } from "./ProjectLinksPanel";
import { ProjectNameDialog } from "./ProjectNameDialog";
import type { ProjectChangeReview } from "./project-change-review";

export function ProjectNavigator({
  project,
  onOpen,
  onAdd,
  onImport,
  onClose,
  onCloseProject,
  onLinksChange,
  onElementsChange,
  onElementsRegistered,
  onRename,
  onDelete,
  dirty,
  indexStatus,
  saving,
  onCancelSave,
  onReviewChanges,
  hasReviewBaseline,
  onExportReview,
  wbsGanttIssues,
  onOpenWbsGanttIssue,
  wbsGanttLinks,
  onOpenWbsGanttLink,
  wbsGanttMissing,
  onAddMissingWbsGanttItem,
  onLinkMissingWbsGanttItem,
}: {
  project: VirtualProject;
  onOpen(documentId: string): void;
  onAdd(kind: DiagramKind, path: string): void | Promise<void>;
  onImport?(): void;
  onClose(): void;
  onCloseProject?(): void;
  onLinksChange(links: readonly ProjectLink[]): void;
  onElementsChange(elements: readonly ProjectElement[]): void;
  onElementsRegistered?(elements: readonly ProjectElement[]): void;
  onRename?(documentId: string, name: string): void;
  onDelete?(documentId: string): void;
  dirty?: boolean;
  indexStatus?: { state: "idle" | "indexing" | "ready" | "error"; message?: string };
  saving?: boolean;
  onCancelSave?(): void;
  onReviewChanges?(): Promise<ProjectChangeReview | undefined>;
  hasReviewBaseline?: boolean;
  onExportReview?(): void | Promise<void>;
  wbsGanttIssues?: readonly (WbsGanttIssue & { documentId: string })[];
  onOpenWbsGanttIssue?(issue: WbsGanttIssue & { documentId: string }): void;
  wbsGanttLinks?: readonly WbsGanttProjectLink[];
  onOpenWbsGanttLink?(documentId: string, kind: "wbs" | "gantt", key: string): void;
  wbsGanttMissing?: readonly WbsGanttMissingItem[];
  onAddMissingWbsGanttItem?(item: WbsGanttMissingItem): void;
  onLinkMissingWbsGanttItem?(item: WbsGanttMissingItem): void;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<DiagramKind>("gantt");
  const [path, setPath] = useState("Gantt diagram");
  const [renaming, setRenaming] = useState<{ id: string; name: string }>();
  const [review, setReview] = useState<ProjectChangeReview>();
  const [reviewing, setReviewing] = useState(false);
  const unlinkedWbsCount = wbsGanttMissing?.filter((item) => item.kind === "wbs").length ?? 0;
  const unlinkedGanttCount = wbsGanttMissing?.filter((item) => item.kind === "gantt").length ?? 0;
  return (
    <aside className="project-navigator" aria-label="Project navigator">
      <header>
        <div>
          <span className="project-navigator-kicker">Project</span>
          <strong>{project.manifest.name}</strong>
          {dirty !== undefined && (
            <span className={`project-save-status ${dirty ? "is-dirty" : "is-saved"}`} role="status">
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
          )}
          {saving && onCancelSave && (
            <button type="button" className="project-cancel-save" onClick={onCancelSave}>
              Cancel save
            </button>
          )}
          {indexStatus && indexStatus.state !== "idle" && (
            <span className={`project-index-status is-${indexStatus.state}`} role="status" title={indexStatus.message}>
              {indexStatus.state === "indexing"
                ? "Updating links…"
                : indexStatus.state === "error"
                  ? "Link index failed"
                  : "Links current"}
            </span>
          )}
          {indexStatus?.state === "error" && indexStatus.message && (
            <small className="project-index-error">{indexStatus.message}</small>
          )}
          <small>
            {project.members.length} diagram{project.members.length === 1 ? "" : "s"} ·{" "}
            {project.manifest.links.length + (wbsGanttLinks?.length ?? 0)} connection
            {project.manifest.links.length + (wbsGanttLinks?.length ?? 0) === 1 ? "" : "s"}
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close project navigator">
          ×
        </button>
        {onCloseProject && (
          <button type="button" onClick={onCloseProject}>
            Close project
          </button>
        )}
      </header>
      <section className="project-navigator-section" aria-labelledby="project-diagrams-heading">
        <div className="project-section-heading">
          <div>
            <h2 id="project-diagrams-heading">Diagrams</h2>
            <p>Diagrams included in this project</p>
          </div>
          <button type="button" className="project-add-diagram" onClick={() => setAdding((value) => !value)}>
            Add diagram
          </button>
          {onImport && (
            <button type="button" onClick={onImport}>
              Import diagram
            </button>
          )}
        </div>
        {adding && (
          <form
            className="project-add-diagram-form"
            onSubmit={async (event) => {
              event.preventDefault();
              await onAdd(kind, path);
              setAdding(false);
            }}
          >
            <label>
              Diagram type
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as DiagramKind;
                  setKind(next);
                  setPath(
                    `${next === "usecase" ? "Use Case" : next === "wbs" ? "WBS" : `${next[0]!.toUpperCase()}${next.slice(1)}`} diagram`,
                  );
                }}
              >
                <option value="gantt">Gantt</option>
                <option value="class">Class</option>
                <option value="component">Component</option>
                <option value="sequence">Sequence</option>
                <option value="usecase">Use Case</option>
                <option value="activity">Activity</option>
                <option value="wbs">WBS</option>
              </select>
            </label>
            <label>
              Diagram name
              <input value={path} onChange={(event) => setPath(event.target.value)} required />
            </label>
            <div>
              <button type="submit">Add to project</button>
              <button type="button" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        <ul>
          {project.members.map((member) => (
            <li key={member.documentId}>
              <div>
                <button type="button" disabled={member.state !== "available"} onClick={() => onOpen(member.documentId)}>
                  <span>{member.path}</span>
                  <small>
                    {member.state === "available"
                      ? `${member.diagramKind} · ${member.linkCount + (wbsGanttLinks?.filter((link) => link.wbsDocumentId === member.documentId || link.ganttDocumentId === member.documentId).length ?? 0)} links`
                      : (member.reason ?? member.state)}
                  </small>
                </button>
                {onRename && (
                  <button
                    type="button"
                    aria-label={`Rename ${member.path}`}
                    onClick={() => setRenaming({ id: member.documentId, name: member.path })}
                  >
                    Rename
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    aria-label={`Delete ${member.path}`}
                    onClick={() => onDelete(member.documentId)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <ProjectLinksPanel
        project={project}
        {...(wbsGanttLinks ? { wbsGanttLinks } : {})}
        {...(onOpenWbsGanttLink ? { onOpenWbsGanttLink } : {})}
        onChange={onLinksChange}
        onElementsChange={onElementsChange}
        {...(onElementsRegistered ? { onElementsRegistered } : {})}
      />
      {wbsGanttMissing && onOpenWbsGanttLink && onAddMissingWbsGanttItem && onLinkMissingWbsGanttItem && (
        <section className="project-navigator-section" aria-labelledby="project-wbs-gantt-missing-heading">
          <div className="project-section-heading">
            <div>
              <h2 id="project-wbs-gantt-missing-heading">WBS–Gantt coverage</h2>
              <p>
                Unlinked: {unlinkedWbsCount} WBS {unlinkedWbsCount === 1 ? "node" : "nodes"} · {unlinkedGanttCount}{" "}
                Gantt {unlinkedGanttCount === 1 ? "task" : "tasks"}
              </p>
            </div>
          </div>
          {wbsGanttMissing.length ? (
            <ul className="project-missing-work-list">
              {wbsGanttMissing.map((item) => (
                <li key={`${item.documentId}:${item.kind}:${item.key}`}>
                  <strong>{item.label}</strong>
                  <small>
                    {item.diagramName} · {item.kind === "wbs" ? "WBS node" : "Gantt task"}
                  </small>
                  <div>
                    <button type="button" onClick={() => onOpenWbsGanttLink(item.documentId, item.kind, item.key)}>
                      Open
                    </button>
                    <button
                      type="button"
                      disabled={
                        !wbsGanttMissing.some(
                          (candidate) =>
                            candidate.kind !== item.kind &&
                            candidate.documentId === item.counterpartDocumentId &&
                            candidate.counterpartDocumentId === item.documentId,
                        )
                      }
                      onClick={() => onLinkMissingWbsGanttItem(item)}
                    >
                      Link existing
                    </button>
                    <button type="button" onClick={() => onAddMissingWbsGanttItem(item)}>
                      Add to {item.kind === "wbs" ? "Gantt" : "WBS"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>Every WBS node and Gantt task in linked diagrams has a counterpart.</p>
          )}
        </section>
      )}
      {wbsGanttIssues && onOpenWbsGanttIssue && (
        <section className="project-navigator-section" aria-labelledby="project-wbs-gantt-issues-heading">
          <div className="project-section-heading">
            <div>
              <h2 id="project-wbs-gantt-issues-heading">WBS–Gantt issues</h2>
              <p>Broken links and dependency warnings in open linked diagrams</p>
            </div>
          </div>
          {wbsGanttIssues.length ? (
            <ul>
              {wbsGanttIssues.map((issue, index) => (
                <li key={`${issue.documentId}-${issue.kind}-${issue.key ?? index}-${index}`}>
                  <button type="button" onClick={() => onOpenWbsGanttIssue(issue)}>
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No issues in open linked diagrams.</p>
          )}
        </section>
      )}
      {onReviewChanges && (
        <section className="project-navigator-section project-change-review" aria-labelledby="project-review-heading">
          <div className="project-section-heading">
            <div>
              <h2 id="project-review-heading">Review changes</h2>
              <p>Compare this project with its last successful save</p>
            </div>
            <button
              type="button"
              disabled={!hasReviewBaseline || reviewing}
              onClick={() => {
                setReviewing(true);
                void onReviewChanges()
                  .then(setReview)
                  .finally(() => setReviewing(false));
              }}
            >
              {reviewing ? "Reviewing…" : "Review"}
            </button>
          </div>
          {!hasReviewBaseline ? (
            <p className="project-review-empty">Save this project once to create a review baseline.</p>
          ) : review && !review.hasChanges ? (
            <p className="project-review-empty">No changes since the last successful save.</p>
          ) : review ? (
            <div className="project-review-results" aria-live="polite">
              {review.diagrams.map((change) => (
                <article key={change.documentId}>
                  <button
                    type="button"
                    onClick={() => onOpen(change.documentId)}
                    disabled={change.kinds.includes("deleted")}
                  >
                    {change.name}
                  </button>
                  <span>{change.kinds.join(" · ")}</span>
                  {change.previousName && <small>Previously {change.previousName}</small>}
                  {change.sourceComparison && (
                    <div className="project-review-comparison">
                      <small>
                        {change.sourceComparison.mode === "semantic" ? "Semantic review" : "Source review"} · +
                        {change.sourceComparison.addedLines} −{change.sourceComparison.removedLines} lines
                      </small>
                      {change.sourceComparison.summaries.map((summary, index) => (
                        <div key={`${summary.title}-${index}`}>
                          <strong>{summary.title}</strong>
                          <small>{summary.detail}</small>
                        </div>
                      ))}
                    </div>
                  )}
                  {change.linkedDocumentIds.length > 0 && (
                    <div className="project-review-impact">
                      <small>Linked diagrams that may need review</small>
                      <div>
                        {change.linkedDocumentIds.map((documentId) => (
                          <button key={documentId} type="button" onClick={() => onOpen(documentId)}>
                            {project.members.find((member) => member.documentId === documentId)?.path ?? documentId}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {review.links.map((change) => (
                <article key={change.linkId}>
                  <strong>{change.kind} relationship</strong>
                  <span>{change.link.kind}</span>
                  <small>
                    Affects {change.documentIds.length} diagram{change.documentIds.length === 1 ? "" : "s"}
                  </small>
                </article>
              ))}
              {onExportReview && (
                <button type="button" className="project-export-review" onClick={() => void onExportReview()}>
                  Export review report
                </button>
              )}
            </div>
          ) : null}
        </section>
      )}
      {renaming && onRename && (
        <ProjectNameDialog
          title="Rename diagram"
          initialValue={renaming.name}
          submitLabel="Rename"
          onSubmit={(name) => {
            onRename(renaming.id, name);
            setRenaming(undefined);
          }}
          onClose={() => setRenaming(undefined)}
        />
      )}
    </aside>
  );
}
