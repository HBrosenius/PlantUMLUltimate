import { useRef } from "react";
import type { ForecastApplyReview } from "./gantt-apply-forecast";
import { useDialogFocus } from "./use-dialog-focus";

export function GanttApplyForecastDialog({
  review,
  stale,
  onApply,
  onClose,
  onRecalculate,
}: {
  review: ForecastApplyReview;
  stale: boolean;
  onApply(): void;
  onClose(): void;
  onRecalculate(): void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="task-dialog gantt-apply-forecast-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-forecast-title"
      >
        <h2 id="apply-forecast-title">Apply forecast to plan</h2>
        <p>
          As of {review.asOf} ·{" "}
          {review.plannedFinish && review.plannedFinish === review.proposedFinish
            ? `project finish unchanged (${review.plannedFinish ?? "—"})`
            : `planned finish ${review.plannedFinish ?? "—"} → proposed finish ${review.proposedFinish ?? "—"}`}
          . This will change the PlantUML plan and save remaining-work estimates where a duration is extended.
        </p>
        {stale && (
          <p className="schedule-warning" role="alert">
            The source or forecast inputs changed. Recalculate before applying.
          </p>
        )}
        {review.error && (
          <p className="schedule-warning" role="alert">
            {review.error}
          </p>
        )}
        {review.roundingNotes.map((note) => (
          <p className="schedule-warning" role="status" key={note}>
            {note}
          </p>
        ))}
        {review.rows.length > 0 && (
          <div className="gantt-apply-forecast-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Planned</th>
                  <th>Proposed</th>
                  <th>Source action</th>
                </tr>
              </thead>
              <tbody>
                {review.rows.map((row) => (
                  <tr key={row.taskId}>
                    <td>{row.label}</td>
                    <td>
                      {row.plannedStart} – {row.plannedEnd}
                    </td>
                    <td>
                      {row.proposedStart} – {row.proposedEnd}
                    </td>
                    <td>{row.sourceAction ?? "Moves through dependency"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {review.sourceAfter && (
          <details>
            <summary>Review exact PlantUML source changes</summary>
            {review.rows
              .filter((row) => row.sourceAction)
              .map((row) => (
                <div key={row.taskId} className="gantt-apply-forecast-source-change">
                  <strong>{row.label}</strong>
                  <pre>
                    Before: {row.before || "(new declaration)"}
                    {"\n"}After: {row.after}
                  </pre>
                </div>
              ))}
            <details>
              <summary>Full proposed source</summary>
              <pre>{review.sourceAfter}</pre>
            </details>
          </details>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {stale && (
            <button type="button" onClick={onRecalculate}>
              Recalculate
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={stale || !review.sourceAfter || Boolean(review.error)}
            onClick={onApply}
          >
            Apply to plan
          </button>
        </div>
      </section>
    </div>
  );
}
