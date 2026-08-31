import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyJiraFieldResolutions,
  buildJiraPullPlan,
  createJiraBaselines,
  findMissingJiraTasks,
  findJiraTaskDivergences,
  removeJiraTasks,
  setJiraDocumentBinding,
  summarizeJiraPullPlan,
  type JiraDocumentBinding,
  type JiraIssueSnapshot,
  type JiraMissingTask,
  type JiraFieldDifference,
  type JiraFieldResolution,
  type JiraPullChange,
  type JiraPullOptions,
  type JiraPullSummary,
  type JiraTaskDivergence,
} from "@plantuml-studio/jira-integration";
import {
  disconnectJira,
  jiraAuthorizationUrl,
  jiraConnection,
  jiraFields,
  jiraPopupReturnUrl,
  jiraSearch,
  normalizeJiraIssue,
  type JiraField,
  type JiraSite,
} from "./jira-client";
import { useDialogFocus } from "./use-dialog-focus";

interface JiraReview {
  baseSource: string;
  issues: JiraIssueSnapshot[];
  siteUrl: string;
  options: JiraPullOptions;
  binding: JiraDocumentBinding;
  previousBaselines: JiraDocumentBinding["baselines"];
  summary: JiraPullSummary;
  changes: JiraPullChange[];
  warnings: string[];
  divergences: JiraTaskDivergence[];
  missingTasks: JiraMissingTask[];
}

function resolutionKey(issueId: string, field: JiraFieldDifference["field"]): string {
  return `${issueId}:${field}`;
}

function displayJiraValue(value: JiraFieldDifference["local"]): string {
  if (value === undefined || value === null || value === "") return "Not set";
  return String(value);
}

export function JiraDialog({
  endpoint,
  source,
  binding,
  readOnly,
  onApply,
  onClose,
}: {
  endpoint: string;
  source: string;
  binding: JiraDocumentBinding | undefined;
  readOnly: boolean;
  onApply(source: string, message: string): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<JiraSite[]>([]);
  const [cloudId, setCloudId] = useState(binding?.cloudId ?? "");
  const [fields, setFields] = useState<JiraField[]>([]);
  const [startFieldId, setStartFieldId] = useState(binding?.startFieldId ?? "");
  const [jql, setJql] = useState(binding?.jql ?? "");
  const [includeAssignee, setIncludeAssignee] = useState(binding?.includeAssignee ?? false);
  const [includeDependencies, setIncludeDependencies] = useState(binding?.includeDependencies ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [review, setReview] = useState<JiraReview>();
  const [resolutions, setResolutions] = useState<Record<string, JiraFieldResolution["choice"]>>({});
  const [removalChoices, setRemovalChoices] = useState<Record<string, "keep" | "remove">>({});
  const selectedSite = sites.find((site) => site.id === cloudId);
  const dateFields = useMemo(() => fields.filter((field) => field.type === "date"), [fields]);

  const loadConnection = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setError(undefined);
      try {
        const connection = await jiraConnection(endpoint);
        if (!isActive()) return;
        const nextSites = connection.sites ?? [];
        setSites(nextSites);
        setCloudId((current) => (nextSites.some((site) => site.id === current) ? current : (nextSites[0]?.id ?? "")));
      } catch (reason) {
        if (isActive()) setError(reason instanceof Error ? reason.message : "Could not reach Jira");
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    let active = true;
    void loadConnection(() => active);
    return () => {
      active = false;
    };
  }, [loadConnection]);

  useEffect(() => {
    const receiveAuthorization = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; result?: unknown };
      if (message.type !== "plantuml-studio:jira-oauth") return;
      if (message.result === "connected") void loadConnection();
      else setError("Jira authorization was not completed");
    };
    window.addEventListener("message", receiveAuthorization);
    return () => window.removeEventListener("message", receiveAuthorization);
  }, [loadConnection]);

  useEffect(() => {
    if (!cloudId) {
      setFields([]);
      return;
    }
    let active = true;
    void jiraFields(endpoint, cloudId)
      .then((next) => active && setFields(next))
      .catch(
        (reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load fields"),
      );
    return () => {
      active = false;
    };
  }, [cloudId, endpoint]);

  const connect = () => {
    const returnUrl = jiraPopupReturnUrl(window.location.href);
    const popup = window.open(
      jiraAuthorizationUrl(endpoint, returnUrl),
      "plantuml-studio-jira-oauth",
      "popup,width=720,height=760",
    );
    if (!popup) setError("Allow popups for this site to connect Jira");
  };

  const disconnect = async () => {
    setError(undefined);
    try {
      await disconnectJira(endpoint);
      setSites([]);
      setCloudId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not disconnect Jira");
    }
  };

  const prepareReview = async () => {
    if (!selectedSite || !jql.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const issues: JiraIssueSnapshot[] = [];
      const seenTokens = new Set<string>();
      let nextPageToken: string | undefined;
      for (let page = 0; page < 50; page += 1) {
        const result = await jiraSearch(endpoint, {
          cloudId,
          jql: jql.trim(),
          fields: [...(startFieldId ? [startFieldId] : []), ...(includeDependencies ? ["issuelinks"] : [])],
          ...(nextPageToken ? { nextPageToken } : {}),
        });
        issues.push(
          ...result.issues.flatMap((issue) => {
            const normalized = normalizeJiraIssue(issue, startFieldId || undefined);
            return normalized ? [normalized] : [];
          }),
        );
        if (!result.nextPageToken) break;
        if (seenTokens.has(result.nextPageToken)) throw new Error("Jira returned a repeated page token");
        seenTokens.add(result.nextPageToken);
        nextPageToken = result.nextPageToken;
        if (page === 49) throw new Error("The Jira query returned more than 5,000 issues; narrow the JQL query");
      }
      const options: JiraPullOptions = {
        includeAssignee,
        includeDependencies,
        manageStartDate: Boolean(startFieldId),
        manageDueDate: true,
        ...(binding?.managedDependencyKeys ? { managedDependencyKeys: binding.managedDependencyKeys } : {}),
      };
      const plan = buildJiraPullPlan(source, selectedSite.url, issues, options);
      const divergences = findJiraTaskDivergences(source, issues, binding?.baselines);
      const missingTasks = findMissingJiraTasks(source, issues, binding?.baselines);
      const nextBinding: JiraDocumentBinding = {
        version: 1,
        bindingId: binding?.bindingId ?? crypto.randomUUID(),
        cloudId,
        siteUrl: selectedSite.url,
        jql: jql.trim(),
        mode: "pull",
        ...(startFieldId ? { startFieldId } : {}),
        ...(includeAssignee ? { includeAssignee: true } : {}),
        ...(includeDependencies ? { includeDependencies: true } : {}),
        baselines: createJiraBaselines(issues),
        managedDependencyKeys: plan.managedDependencyKeys,
      };
      setReview({
        baseSource: source,
        issues,
        siteUrl: selectedSite.url,
        options,
        binding: nextBinding,
        previousBaselines: binding?.baselines,
        summary: summarizeJiraPullPlan(plan),
        changes: plan.changes.filter((change) => change.kind !== "unchanged"),
        warnings: plan.warnings,
        divergences,
        missingTasks,
      });
      setResolutions({});
      setRemovalChoices({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import Jira issues");
    } finally {
      setBusy(false);
    }
  };

  const applyReview = () => {
    if (!review || readOnly) return;
    if (unresolvedCount > 0 || unresolvedRemovalCount > 0) return;
    const selected: JiraFieldResolution[] = review.divergences.flatMap((divergence) =>
      [...divergence.conflicts, ...divergence.localChanges].map((difference) => ({
        issueId: divergence.issueId,
        field: difference.field,
        choice: resolutions[resolutionKey(divergence.issueId, difference.field)]!,
      })),
    );
    const resolvedIssues = applyJiraFieldResolutions(review.issues, review.divergences, selected);
    const plan = buildJiraPullPlan(review.baseSource, review.siteUrl, resolvedIssues, review.options);
    const removedIssueIds = review.missingTasks
      .filter((task) => removalChoices[task.issueId] === "remove")
      .map((task) => task.issueId);
    const keptBaselines = Object.fromEntries(
      review.missingTasks.flatMap((task) => {
        const baseline = review.previousBaselines?.[task.issueId];
        return removalChoices[task.issueId] === "keep" && baseline ? [[task.issueId, baseline] as const] : [];
      }),
    );
    const nextBinding = {
      ...review.binding,
      baselines: { ...review.binding.baselines, ...keptBaselines },
      managedDependencyKeys: plan.managedDependencyKeys,
    };
    const nextSource = setJiraDocumentBinding(removeJiraTasks(plan.source, removedIssueIds), nextBinding);
    const changed = plan.changes.filter((change) => change.kind !== "unchanged").length;
    onApply(nextSource, `Jira synchronized ${resolvedIssues.length} issues · ${changed} changes`);
    onClose();
  };

  const reviewDifferences = review
    ? review.divergences.flatMap((divergence) =>
        [...divergence.conflicts, ...divergence.localChanges].map((difference) => ({ divergence, difference })),
      )
    : [];
  const unresolvedCount = reviewDifferences.filter(
    ({ divergence, difference }) => !resolutions[resolutionKey(divergence.issueId, difference.field)],
  ).length;
  const unresolvedRemovalCount = review?.missingTasks.filter((task) => !removalChoices[task.issueId]).length ?? 0;

  const resolveAll = (choice: JiraFieldResolution["choice"]) =>
    setResolutions(
      Object.fromEntries(
        reviewDifferences.map(({ divergence, difference }) => [
          resolutionKey(divergence.issueId, difference.field),
          choice,
        ]),
      ),
    );

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialog}
        className="task-dialog jira-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Jira integration"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>Jira</h2>
            <p>
              {review
                ? "Review Jira changes before updating the chart."
                : "Import a Jira Cloud query into this Gantt chart."}
            </p>
          </div>
          <button type="button" aria-label="Close Jira integration" onClick={onClose}>
            ×
          </button>
        </header>
        {loading ? (
          <p>Checking Jira connection…</p>
        ) : sites.length === 0 ? (
          <>
            <p>Connect Jira to choose a site and import issues. Credentials stay in the integration service.</p>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={connect}>
                Connect Jira
              </button>
            </div>
          </>
        ) : review ? (
          <>
            <div className="jira-review-summary" aria-label="Jira synchronization summary">
              <span>
                <strong>{review.summary.created}</strong> created
              </span>
              <span>
                <strong>{review.summary.updated}</strong> updated
              </span>
              <span>
                <strong>{review.summary.dependencies}</strong> dependencies
              </span>
              <span>
                <strong>{review.summary.unchanged}</strong> unchanged
              </span>
            </div>
            {review.changes.length === 0 ? (
              <p className="jira-review-empty">The chart is already up to date.</p>
            ) : (
              <ul className="jira-review-list">
                {review.changes.slice(0, 100).map((change, index) => (
                  <li key={`${change.issueId}-${change.kind}-${index}`}>
                    <strong>{change.issueKey}</strong>
                    <span>
                      {change.kind === "dependency-created"
                        ? "dependency added"
                        : change.kind === "dependency-removed"
                          ? "dependency removed"
                          : change.kind}
                    </span>
                    {change.fields.length > 0 && <small>{change.fields.join(", ")}</small>}
                  </li>
                ))}
                {review.changes.length > 100 && <li>…and {review.changes.length - 100} more changes</li>}
              </ul>
            )}
            {review.warnings.length > 0 && (
              <details className="jira-review-warnings">
                <summary>{review.warnings.length} warnings</summary>
                <ul>
                  {review.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            {review.divergences.length > 0 && (
              <div className="jira-conflicts">
                <div className="jira-conflict-heading">
                  <div>
                    <strong>{reviewDifferences.length} fields need resolution</strong>
                    <p>Choose which value the Gantt chart should keep.</p>
                  </div>
                  <div>
                    <button type="button" onClick={() => resolveAll("local")}>
                      Keep all local
                    </button>
                    <button type="button" onClick={() => resolveAll("jira")}>
                      Use all Jira
                    </button>
                  </div>
                </div>
                <div className="jira-conflict-list">
                  {reviewDifferences.map(({ divergence, difference }) => {
                    const key = resolutionKey(divergence.issueId, difference.field);
                    const choice = resolutions[key];
                    return (
                      <section key={key} aria-label={`${divergence.issueKey} ${difference.field}`}>
                        <header>
                          <strong>{divergence.issueKey}</strong>
                          <span>{difference.field}</span>
                          {divergence.conflicts.includes(difference) && <em>changed in both</em>}
                        </header>
                        <div className="jira-conflict-values">
                          <small>
                            Baseline<strong>{displayJiraValue(difference.baseline)}</strong>
                          </small>
                          <small>
                            Local<strong>{displayJiraValue(difference.local)}</strong>
                          </small>
                          <small>
                            Jira<strong>{displayJiraValue(difference.remote)}</strong>
                          </small>
                        </div>
                        <div className="jira-conflict-actions">
                          <button
                            type="button"
                            className={choice === "local" ? "selected" : undefined}
                            aria-pressed={choice === "local"}
                            onClick={() => setResolutions((current) => ({ ...current, [key]: "local" }))}
                          >
                            Keep local
                          </button>
                          <button
                            type="button"
                            className={choice === "jira" ? "selected" : undefined}
                            aria-pressed={choice === "jira"}
                            onClick={() => setResolutions((current) => ({ ...current, [key]: "jira" }))}
                          >
                            Use Jira
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
            {review.missingTasks.length > 0 && (
              <div className="jira-removals">
                <div className="jira-conflict-heading">
                  <div>
                    <strong>{review.missingTasks.length} tasks are no longer in the Jira query</strong>
                    <p>They may have moved, been deleted, or fallen outside the current JQL filter.</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setRemovalChoices(Object.fromEntries(review.missingTasks.map((task) => [task.issueId, "keep"])))
                      }
                    >
                      Keep all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRemovalChoices(
                          Object.fromEntries(review.missingTasks.map((task) => [task.issueId, "remove"])),
                        )
                      }
                    >
                      Remove all
                    </button>
                  </div>
                </div>
                <div className="jira-removal-list">
                  {review.missingTasks.map((task) => {
                    const choice = removalChoices[task.issueId];
                    return (
                      <section key={task.issueId}>
                        <div>
                          <strong>{task.issueKey}</strong>
                          <span>{task.summary}</span>
                          {task.locallyChanged && <em>locally edited</em>}
                        </div>
                        <div className="jira-conflict-actions">
                          <button
                            type="button"
                            className={choice === "keep" ? "selected" : undefined}
                            aria-pressed={choice === "keep"}
                            onClick={() => setRemovalChoices((current) => ({ ...current, [task.issueId]: "keep" }))}
                          >
                            Keep task
                          </button>
                          <button
                            type="button"
                            className={choice === "remove" ? "selected danger" : undefined}
                            aria-pressed={choice === "remove"}
                            onClick={() => setRemovalChoices((current) => ({ ...current, [task.issueId]: "remove" }))}
                          >
                            Remove
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="dialog-actions">
              <button type="button" onClick={() => setReview(undefined)}>
                Back
              </button>
              <span />
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={readOnly || unresolvedCount > 0 || unresolvedRemovalCount > 0}
                onClick={applyReview}
              >
                {unresolvedCount + unresolvedRemovalCount > 0
                  ? `Resolve ${unresolvedCount + unresolvedRemovalCount} items`
                  : "Apply changes"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label>
              Jira site
              <select value={cloudId} onChange={(event) => setCloudId(event.target.value)}>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              JQL
              <textarea
                required
                rows={3}
                placeholder="project = APP ORDER BY Rank"
                value={jql}
                onChange={(event) => setJql(event.target.value)}
              />
            </label>
            <label>
              Start date
              <select value={startFieldId} onChange={(event) => setStartFieldId(event.target.value)}>
                <option value="">Do not import</option>
                {dateFields.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="jira-check">
              <input
                type="checkbox"
                checked={includeAssignee}
                onChange={(event) => setIncludeAssignee(event.target.checked)}
              />
              Import assignee as a 100% resource
            </label>
            <label className="jira-check">
              <input
                type="checkbox"
                checked={includeDependencies}
                onChange={(event) => setIncludeDependencies(event.target.checked)}
              />
              Import Jira “blocks” links as task dependencies
            </label>
            <p className="jira-disclosure">
              Imported summaries, dates, statuses, and assignees become part of the PlantUML file and may be visible to
              anyone it is shared with.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => void disconnect()}>
                Disconnect
              </button>
              <span />
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={readOnly || busy || !jql.trim()}
                onClick={() => void prepareReview()}
              >
                {busy ? "Checking Jira…" : binding ? "Review refresh" : "Review import"}
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="field-error jira-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
