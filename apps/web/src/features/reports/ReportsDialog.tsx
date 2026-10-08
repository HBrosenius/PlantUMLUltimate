import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../../use-dialog-focus";
import { forecastToday } from "../../forecast-date";
import { downloadBlob } from "../../file-service";
import { resourceIdentity } from "../../resource-identity";
import { buildTaskCheckIn } from "./build-task-check-in";
import { defaultIntroduction, defaultSignOff, type ReportOptions, type TaskFilter } from "./report-model";
import { renderReportHtml, type ReportChartPanel } from "./render-report-html";
import { renderReportText } from "./render-report-text";
import { copyChart, copyPlain, copyReport } from "./report-clipboard";
import { renderReportCharts } from "./report-gantt-chart";
import { InspectorSection } from "../../InspectorSection";
import { reportLocale } from "./report-format";
import { reportWording, saveReportWording } from "./report-preferences";

export function ReportsDialog({
  source,
  sourceIdentity,
  documentName,
  diagramName,
  timeZone,
  resource,
  onClose,
}: {
  source: string;
  sourceIdentity: string;
  documentName: string;
  diagramName: string;
  timeZone?: string | undefined;
  resource?: string | undefined;
  onClose(): void;
}) {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const root = useRef<HTMLDivElement>(null);
  useDialogFocus(root, onClose);
  const [captured, setCaptured] = useState({ source, sourceIdentity, documentName, diagramName, zone });
  const [options, setOptions] = useState<ReportOptions>(() => ({
    asOf: forecastToday(zone),
    timeZone: zone,
    filter: "Ongoing",
    people: resource ? [resourceIdentity(resource)] : [],
    excluded: [],
    unresolved: true,
    milestones: false,
    combined: false,
    unassigned: false,
    notes: false,
    links: false,
    compact: false,
    chart: false,
    replyBy: "",
    locale: reportLocale(),
    ...reportWording(),
  }));
  const [initialized, setInitialized] = useState(false);
  const result = useMemo(() => {
    try {
      return {
        snapshot: buildTaskCheckIn(
          captured.source,
          captured.sourceIdentity,
          captured.documentName,
          captured.diagramName,
          options,
        ),
        error: "",
      };
    } catch (error) {
      return { snapshot: undefined, error: error instanceof Error ? error.message : String(error) };
    }
  }, [captured, options]);
  const snapshot = result.snapshot;
  useEffect(() => {
    if (!initialized && snapshot) {
      setInitialized(true);
      if (!resource) setOptions((current) => ({ ...current, people: snapshot.recipients.map((p) => p.id) }));
    }
  }, [initialized, snapshot, resource]);
  const [recipient, setRecipient] = useState(resource ? resourceIdentity(resource) : "");
  const message = snapshot?.messages.find((m) => m.id === recipient) ?? snapshot?.messages[0];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [chartState, setChartState] = useState<{ key: string; panels: ReportChartPanel[]; error: string }>({
    key: "",
    panels: [],
    error: "",
  });
  const key = snapshot && message ? JSON.stringify([snapshot, message.id]) : "";
  const currentKey = useRef(key);
  currentKey.current = key;
  const stale =
    captured.source !== source ||
    captured.sourceIdentity !== sourceIdentity ||
    captured.zone !== zone ||
    captured.documentName !== documentName ||
    captured.diagramName !== diagramName;
  useEffect(() => {
    let cancelled = false;
    if (!snapshot || !message || !options.chart) return;
    void renderReportCharts(snapshot, message, captured.source)
      .then((panels) => {
        if (!cancelled) setChartState({ key, panels, error: "" });
      })
      .catch((error) => {
        if (!cancelled)
          setChartState({ key, panels: [], error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot, message, options.chart, captured.source, key, retry]);
  const panels = chartState.key === key ? chartState.panels : [];
  const chartError = chartState.key === key ? chartState.error : "";
  const chartReady = !options.chart || panels.length > 0;
  const html = snapshot && message ? renderReportHtml(snapshot, message, panels) : "";
  const plain = snapshot && message ? renderReportText(snapshot, message) : "";
  const set = <K extends keyof ReportOptions>(field: K, value: ReportOptions[K]) => {
    if ((field === "introduction" || field === "signOff") && typeof value === "string") saveReportWording(field, value);
    setOptions((current) => ({ ...current, [field]: value }));
    setStatus("");
  };
  const perform = async (action: () => Promise<void>, success: string, body = false) => {
    try {
      await action();
      if (currentKey.current !== key) return;
      setStatus(success);
      if (body && message) setCopied((current) => ({ ...current, [message.id]: key }));
    } catch (error) {
      setStatus(
        `Copy failed: ${error instanceof Error ? error.message : String(error)} Use plain text, HTML download, or manual selection.`,
      );
    }
  };
  return (
    <div className="modal-backdrop reports-backdrop">
      <div
        ref={root}
        className="reports-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reports-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="reports-eyebrow">Reports</span>
            <h2 id="reports-title">Task check-in</h2>
          </div>
          <button onClick={onClose} aria-label="Close reports">
            ×
          </button>
        </header>
        <p className="reports-source">
          {documentName} <span aria-hidden="true">/</span> {diagramName}
        </p>
        {stale && (
          <p role="alert">
            Plan changed — refresh report.{" "}
            <button
              onClick={() => {
                setCaptured({ source, sourceIdentity, documentName, diagramName, zone });
                set("timeZone", zone);
              }}
            >
              Refresh report
            </button>
          </p>
        )}
        <div className="reports-layout">
          <section className="reports-options" aria-label="Report options">
            <InspectorSection title="Scope & dates">
              <label>
                Tasks
                <select
                  value={options.filter}
                  onChange={(e) => {
                    set("filter", e.target.value as TaskFilter);
                    set("excluded", []);
                  }}
                >
                  {["Ongoing", "All tasks", "Upcoming", "Overdue", "Completed"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                As-of date
                <input type="date" value={options.asOf} onChange={(e) => set("asOf", e.target.value)} />
              </label>
              <small>{zone}. Uses current recorded progress, including for past dates.</small>
              <label>
                Reply by (optional)
                <input type="date" value={options.replyBy} onChange={(e) => set("replyBy", e.target.value)} />
              </label>
              <label>
                Output
                <select
                  value={options.combined ? "combined" : "individual"}
                  onChange={(e) => set("combined", e.target.value === "combined")}
                >
                  <option value="individual">Individual messages</option>
                  <option value="combined">Combined coordinator summary</option>
                </select>
              </label>
              <small>Report scope is independent of canvas filters.</small>
            </InspectorSection>
            <InspectorSection title="People">
              <label>
                Search people
                <input value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div>
                <button onClick={() => set("people", snapshot?.recipients.map((p) => p.id) ?? [])}>Select all</button>
                <button onClick={() => set("people", [])}>Clear</button>
              </div>
              {snapshot?.recipients
                .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
                .map((person) => (
                  <label className="reports-check" key={person.id}>
                    <input
                      type="checkbox"
                      checked={options.people.includes(person.id)}
                      onChange={(e) =>
                        set(
                          "people",
                          e.target.checked
                            ? [...options.people, person.id]
                            : options.people.filter((id) => id !== person.id),
                        )
                      }
                    />
                    {person.name} · {person.count || "No matching"} tasks
                  </label>
                ))}
            </InspectorSection>
            <InspectorSection title="Content & layout">
              {(
                [
                  ["unresolved", "Include schedule needing clarification"],
                  ["milestones", "Include milestones"],
                  ["notes", "Include notes"],
                  ["links", "Include task links"],
                  ["compact", "Compact layout"],
                  ["chart", "Include Gantt chart"],
                ] as const
              ).map(([field, label]) => (
                <label className="reports-check" key={field}>
                  <input type="checkbox" checked={options[field]} onChange={(e) => set(field, e.target.checked)} />
                  {label}
                </label>
              ))}
              <small>
                Ongoing includes unfinished work already started, past planned finish, or positive progress. Unknown
                dates are included when enabled.
              </small>
              {options.combined && (
                <label className="reports-check">
                  <input
                    type="checkbox"
                    checked={options.unassigned}
                    onChange={(e) => set("unassigned", e.target.checked)}
                  />
                  Include unassigned tasks
                </label>
              )}
            </InspectorSection>
            <InspectorSection title="Message wording">
              <small>Remembered in this browser for your next report.</small>
              <label>
                Introduction
                <textarea
                  aria-label="Introduction"
                  value={options.introduction}
                  onChange={(e) => set("introduction", e.target.value)}
                />
              </label>
              <label>
                Sign-off
                <textarea
                  aria-label="Sign-off"
                  value={options.signOff}
                  onChange={(e) => set("signOff", e.target.value)}
                />
              </label>
              <button
                onClick={() => {
                  set("introduction", defaultIntroduction);
                  set("signOff", defaultSignOff);
                }}
              >
                Restore default wording
              </button>
            </InspectorSection>
            <InspectorSection title={`Individual tasks · ${options.excluded.length} excluded`}>
              <button onClick={() => set("excluded", [])}>Reset exclusions</button>
              {snapshot?.candidates.map((row) => (
                <label className="reports-check" key={row.task.id}>
                  <input
                    type="checkbox"
                    checked={!options.excluded.includes(row.task.id)}
                    onChange={(e) =>
                      set(
                        "excluded",
                        e.target.checked
                          ? options.excluded.filter((id) => id !== row.task.id)
                          : [...options.excluded, row.task.id],
                      )
                    }
                  />
                  {row.task.label}
                </label>
              ))}
            </InspectorSection>
          </section>
          <section className="reports-preview" aria-label="Report preview">
            {result.error && <p role="alert">{result.error} Open Problems to review source issues.</p>}
            {snapshot && (
              <>
                <p className="reports-summary">
                  {snapshot.recipients.filter((p) => options.people.includes(p.id) && p.count).length} people ·{" "}
                  {snapshot.uniqueTasks} unique tasks · {snapshot.assignments} assignments
                </p>
                {snapshot.unresolvedExcluded > 0 && (
                  <p>
                    {snapshot.unresolvedExcluded} unresolved tasks excluded. Enable schedule clarification to include
                    them.
                  </p>
                )}
                {snapshot.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </>
            )}
            {!message && (
              <p>
                No matching tasks or recipients. Select people, choose All tasks, or include unassigned work in a
                combined summary.
              </p>
            )}
            {message && (
              <>
                <label>
                  Preview recipient
                  <select value={message.id} onChange={(e) => setRecipient(e.target.value)}>
                    {snapshot!.messages.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.recipient} · {m.rows.length} tasks · {m.rows.filter((r) => r.attention).length} attention
                        {copied[m.id] === JSON.stringify([snapshot, m.id]) ? " · Copied" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="reports-subject">
                  <strong>Subject:</strong> {message.subject}
                </p>
                {options.chart && (
                  <div role="status">
                    {panels.length ? "Chart ready" : chartError || "Rendering chart…"}
                    {chartError && <button onClick={() => setRetry((n) => n + 1)}>Retry chart</button>}
                    <button onClick={() => set("chart", false)}>Continue without chart</button>
                    <p>
                      The email editor may remove the image. Paste the formatted body, then copy/paste or insert the PNG
                      separately if needed.
                    </p>
                    {panels.map((panel, index) => (
                      <div key={index}>
                        <button
                          disabled={stale}
                          onClick={() => void perform(() => copyChart(panel.blob), "Chart copied")}
                        >
                          Copy chart {index + 1}
                        </button>
                        <button
                          disabled={stale}
                          onClick={() => downloadBlob(panel.blob, `task-check-in-${index + 1}.png`)}
                        >
                          Download chart PNG {index + 1}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <iframe title="Exported email preview" sandbox="" srcDoc={html} />
                <details>
                  <summary>Plain text / manual fallback</summary>
                  <textarea id="report-manual-text" readOnly value={plain} aria-label="Report text" />
                </details>
              </>
            )}
          </section>
        </div>
        <footer>
          <button
            className="primary"
            disabled={!message || stale || !chartReady}
            onClick={() =>
              void perform(
                () => copyReport(html, plain),
                "Copied for email. Use normal paste into a rich-text email body.",
                true,
              )
            }
          >
            Copy for email
          </button>
          <button
            disabled={!message || stale}
            onClick={() => void perform(() => copyPlain(message!.subject), "Subject copied")}
          >
            Copy subject
          </button>
          <button
            disabled={!message || stale}
            onClick={() => void perform(() => copyPlain(plain), "Plain text copied", true)}
          >
            Copy plain text
          </button>
          <button
            disabled={!message || stale || !chartReady}
            onClick={() => downloadBlob(new Blob([html], { type: "text/html" }), "task-check-in.html")}
          >
            Download HTML
          </button>
          <button
            disabled={!message || stale}
            onClick={() => {
              const area = root.current?.querySelector<HTMLTextAreaElement>("#report-manual-text");
              if (area) {
                area.closest("details")!.open = true;
                area.focus();
                area.select();
              }
            }}
          >
            Select report text
          </button>
          <p role="status">{status}</p>
        </footer>
      </div>
    </div>
  );
}
