import type { ProjectElement, ProjectLink } from "@plantuml-studio/project-model";
import { useState } from "react";
import type { DiagramKind } from "../model";
import type { WbsGanttIssue } from "../wbs-gantt-health";
import type { WbsGanttProjectLink } from "./wbs-gantt-project-links";
import type { WbsGanttMissingItem } from "./wbs-gantt-missing";
import type { VirtualProject } from "./project-index";
import { ProjectLinksPanel } from "./ProjectLinksPanel";
import { ProjectNameDialog } from "./ProjectNameDialog";
import type { ProjectRecoveryStatus } from "./use-embedded-project";
import type { ProjectChangeReview } from "./project-change-review";

export function ProjectNavigator({
  project,
  readOnly = false,
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
  recoveryStatus,
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
  readOnly?: boolean;
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
  recoveryStatus?: ProjectRecoveryStatus;
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
    <aside className="project-navigator" aria-label="Document navigator">
      <header>
        <div>
          <span className="project-navigator-kicker">Document</span>
          <strong>{project.manifest.name}</strong>
          {dirty !== undefined && (
            <span className={`project-save-status ${dirty ? "is-dirty" : "is-saved"}`} role="status">
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
          )}
          {recoveryStatus && recoveryStatus !== "idle" && (
            <small role="status">
              {recoveryStatus === "saving"
                ? "Updating local recovery…"
                : recoveryStatus === "current"
                  ? "Local recovery current in this browser"
                  : recoveryStatus === "disabled"
                    ? "Local recovery disabled for encrypted documents. Save a file copy."
                    : "Local recovery failed. Save a file copy to protect your changes."}
            </small>
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
        <button type="button" onClick={onClose} aria-label="Close document navigator">
          ×
        </button>
        {onCloseProject && (
          <button type="button" onClick={onCloseProject}>
            Close document
          </button>
        )}
      </header>
      <section className="project-navigator-section" aria-label="Connected document overview">
        <h2>Connected document overview</h2>
        <button
          type="button"
          onClick={(event) => {
            const target = event.currentTarget
              .closest("aside")
              ?.querySelector<HTMLElement>(".project-link-repairs, .project-existing-links");
            target?.scrollIntoView({ block: "start", behavior: "smooth" });
            if (target) {
              target.tabIndex = -1;
              target.focus({ preventScroll: true });
            }
          }}
        >
          Review object connections
        </button>
        <p>Open a diagram to inspect its objects, then review connections and any unlinked work below.</p>
        {(wbsGanttLinks ?? []).some((link) => link.missingWbsNode || link.missingGanttTask) && (
          <p role="status">
            Some WBS–Gantt connections have missing objects. Inspect their remaining endpoint in Existing links below,
            then use Linked diagrams to repair the connection.
          </p>
        )}
        <ul>
          {project.members.map((member) => {
            const ids = new Set(
              project.manifest.elements
                .filter((element) => element.documentId === member.documentId)
                .map((element) => element.id),
            );
            const connections = project.manifest.links.filter((link) => ids.has(link.from) || ids.has(link.to));
            const needsReview = connections.filter((link) =>
              [link.from, link.to].some((id) => {
                const state = project.resolutions.get(id)?.state;
                return state !== "resolved" && state !== undefined;
              }),
            ).length;
            const pending = connections.filter((link) =>
              [link.from, link.to].some((id) => !project.resolutions.has(id)),
            ).length;
            const scheduled = (wbsGanttLinks ?? []).filter(
              (link) => link.wbsDocumentId === member.documentId || link.ganttDocumentId === member.documentId,
            ).length;
            return (
              <li key={member.documentId}>
                <button
                  type="button"
                  aria-label={`Inspect diagram ${member.path}`}
                  disabled={member.state !== "available"}
                  onClick={() => onOpen(member.documentId)}
                >
                  {member.path}
                </button>
                <span>
                  {" "}
                  · {connections.length} object connections · {scheduled} WBS–Gantt connections
                </span>
                {needsReview > 0 && <span> · {needsReview} need review</span>}
                {pending > 0 && <span> · {pending} awaiting link check</span>}
                {member.state !== "available" && <span> · {member.reason ?? member.state}</span>}
              </li>
            );
          })}
        </ul>
        {!project.manifest.links.length && !wbsGanttLinks?.length && (
          <p>
            No connected objects yet. Use Links between diagram items below, or open a WBS diagram and choose Linked
            diagrams to create a connected Gantt chart.
          </p>
        )}
        {!!wbsGanttMissing?.length && (
          <p>
            {wbsGanttMissing.length} unlinked items: use WBS–Gantt coverage below to link existing work or preview
            adding its counterpart.
          </p>
        )}
        {!!wbsGanttIssues?.length && (
          <p>{wbsGanttIssues.length} warnings in open linked diagrams: inspect WBS–Gantt issues below.</p>
        )}
        {onReviewChanges && <p>Use Review changes below to inspect the effect on connected diagrams before saving.</p>}
      </section>
      <section className="project-navigator-section" aria-labelledby="project-diagrams-heading">
        <div className="project-section-heading">
          <div>
            <h2 id="project-diagrams-heading">Diagrams</h2>
            <p>Diagrams included in this document</p>
          </div>
          <button
            type="button"
            className="project-add-diagram"
            disabled={readOnly}
            onClick={() => setAdding((value) => !value)}
          >
            Add diagram
          </button>
          {onImport && !readOnly && (
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
              <button type="submit">Add to document</button>
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
                {onRename && !readOnly && (
                  <button
                    type="button"
                    aria-label={`Rename ${member.path}`}
                    onClick={() => setRenaming({ id: member.documentId, name: member.path })}
                  >
                    Rename
                  </button>
                )}
                {onDelete && !readOnly && (
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
        readOnly={readOnly}
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
                        readOnly ||
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
                    <button type="button" disabled={readOnly} onClick={() => onAddMissingWbsGanttItem(item)}>
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
              <p>Compare this document with its last successful save</p>
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
            <p className="project-review-empty">Save this document once to create a review baseline.</p>
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
