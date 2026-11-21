import type { ReactNode } from "react";
import { GanttReviewDetails } from "./GanttReviewDetails";
import type { DiagramKind } from "./model";
import type { ReviewGroup } from "./semantic-review";

/**
 * The semantic review list: change groups with checkboxes, details and "show" actions. It is controlled and
 * knows nothing about where the two sources come from, so version history and AI proposals share it. Actions
 * that act on the selection (export, apply) are passed as children and render below the list.
 */
export function ReviewPanel({
  groups,
  diagramKind,
  before,
  selectedGroups,
  onSelectedGroupsChange,
  activeGroupId,
  visibleGroupIds,
  onShowInDiagram,
  onShowInSource,
  outsideGroupIds,
  heading = "Proposed change groups",
  description = "Select confirmed groups, then review their combined result. Unclassified changes require Source review.",
  emptyText = "No changes between these versions.",
  children,
}: {
  groups: readonly ReviewGroup[];
  diagramKind: DiagramKind;
  /** The source the groups are applied to; Gantt details read it. */
  before: string;
  selectedGroups: ReadonlySet<string>;
  onSelectedGroupsChange(next: Set<string>): void;
  activeGroupId: string | undefined;
  visibleGroupIds: ReadonlySet<string>;
  onShowInDiagram(groupId: string): void;
  onShowInSource(groupId: string): void;
  /** Groups that touch lines outside the user's selection. They are labelled; callers leave them unchecked. */
  outsideGroupIds?: ReadonlySet<string> | undefined;
  heading?: string;
  description?: string;
  emptyText?: string;
  children?: ReactNode;
}) {
  return (
    <div className="semantic-review" aria-label="Semantic changes">
      <header>
        <div>
          <strong>{heading}</strong>
          <p>{description}</p>
        </div>
        <span>
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="semantic-review-groups">
        {groups.length ? (
          groups.map((group) => {
            const confirmed = group.confidence === "confirmed";
            const visibleInDiagram = visibleGroupIds.has(group.id);
            const diagramAction = visibleInDiagram
              ? visibleGroupIds.size > 1
                ? {
                    label: "Show only in diagram",
                    ariaLabel: `Show only ${group.title} in rendered diagrams`,
                  }
                : { label: "Hide from diagram", ariaLabel: `Hide ${group.title} from rendered diagrams` }
              : visibleGroupIds.size
                ? { label: "Add to diagram", ariaLabel: `Add ${group.title} to rendered diagrams` }
                : { label: "Show in diagram", ariaLabel: `Show ${group.title} in rendered diagrams` };
            return (
              <div
                className={`semantic-review-group ${group.confidence}${activeGroupId === group.id ? " active" : ""}`}
                key={group.id}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${group.title}`}
                  disabled={!confirmed}
                  checked={selectedGroups.has(group.id)}
                  onChange={(event) => {
                    const next = new Set(selectedGroups);
                    if (event.target.checked) next.add(group.id);
                    else next.delete(group.id);
                    onSelectedGroupsChange(next);
                  }}
                />
                <span className="semantic-review-group-copy">
                  <strong>{group.title}</strong>
                  <small>{group.confidence[0]!.toUpperCase() + group.confidence.slice(1)}</small>
                  {outsideGroupIds?.has(group.id) && (
                    <small className="semantic-review-outside">Outside your selection</small>
                  )}
                  <span>{group.detail}</span>
                  {diagramKind === "gantt" && <GanttReviewDetails group={group} before={before} />}
                </span>
                <span className="semantic-review-inspect">
                  <button
                    type="button"
                    disabled={!confirmed || (!group.leftTargets.length && !group.rightTargets.length)}
                    aria-label={diagramAction.ariaLabel}
                    aria-pressed={visibleInDiagram}
                    onClick={() => onShowInDiagram(group.id)}
                  >
                    {diagramAction.label}
                  </button>
                  <button
                    type="button"
                    aria-label={`Show ${group.title} in source`}
                    onClick={() => onShowInSource(group.id)}
                  >
                    Show in source
                  </button>
                </span>
              </div>
            );
          })
        ) : (
          <p>{emptyText}</p>
        )}
      </div>
      {children}
    </div>
  );
}
