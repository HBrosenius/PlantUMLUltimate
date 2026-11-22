import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { validateGeneratedSource } from "../../generated-source-validation";
import { ReviewPanel } from "../../ReviewPanel";
import { useDialogFocus } from "../../use-dialog-focus";
import { applyReviewGroups } from "../../semantic-review";
import type { DiagramKind } from "../../model";
import { getAiAssistantState, getAiKey, subscribeAiAssistant } from "./ai-settings";
import { instructionWithAnswers, runAiEdit, type AiEditOutcome, type AiEditPhase } from "./ai-edit-session";
import { estimateCostUsd, findAiModel, hasPrice, type AiUsage } from "./models";
import { AI_PROVIDERS } from "./providers";
import { selectionFromOffsets, type AiEditRequest, type AiSelection } from "./prompt";
import { requestAiEdit } from "./provider";
import { reviewProposal } from "./proposal-checks";
import { useProposalRenderCheck } from "./use-proposal-render-check";
import { WhatWillBeSent } from "./WhatWillBeSent";

type View =
  | { name: "compose" }
  | { name: "working"; phase: AiEditPhase; received: number }
  | { name: "questions"; questions: string[] }
  | { name: "failed"; message: string; problems: string[] }
  | { name: "confirm"; outcome: Extract<AiEditOutcome, { type: "proposal" }> }
  | { name: "review"; outcome: Extract<AiEditOutcome, { type: "proposal" }> };

const PHASE_TEXT: Record<AiEditPhase, string> = {
  drafting: "Drafting…",
  checking: "Checking the proposal…",
  retrying: "The first answer had problems. Asking again…",
};

function usageText(model: string, usage: AiUsage): string {
  const tokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (!tokens && !usage.outputTokens) return "";
  const cost = hasPrice(model) ? estimateCostUsd(model, usage) : 0;
  return `Used ${tokens} input and ${usage.outputTokens} output tokens${cost ? ` (about $${cost.toFixed(3)})` : ""}.`;
}

/**
 * Ask the AI assistant to change the selection. The dialog drives one request at a time: compose, draft,
 * check, optional questions, review, apply. Nothing is applied except through `onApply`, which is the same
 * guarded path version history uses.
 */
export function AiEditDialog({
  kind,
  source,
  selection: range,
  readOnly,
  onApply,
  onClose,
}: {
  kind: DiagramKind;
  /** The live document source. */
  source: string;
  /** Character range of the selection in `source` when the dialog opened. */
  selection?: { from: number; to: number } | undefined;
  readOnly: boolean;
  onApply(source: string, expectedSource: string): Promise<boolean>;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | undefined>(undefined);
  const liveSource = useRef(source);
  liveSource.current = source;
  const [opened] = useState(source);
  const selection = useMemo<AiSelection | undefined>(
    () => (range && range.to > range.from ? selectionFromOffsets(opened, range.from, range.to) : undefined),
    [opened, range],
  );
  const selectedText = useMemo(() => {
    if (!selection) return "";
    return opened
      .split("\n")
      .slice(selection.startLine - 1, selection.endLine)
      .join("\n");
  }, [opened, selection]);
  const settings = useSyncExternalStore(subscribeAiAssistant, getAiAssistantState);
  const providerLabel = AI_PROVIDERS[settings.provider].label;
  const modelLabel = findAiModel(settings.provider, settings.model)?.label ?? settings.model;

  const [view, setView] = useState<View>({ name: "compose" });
  const [instruction, setInstruction] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [usage, setUsage] = useState<AiUsage | undefined>();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useDialogFocus(dialog, () => {
    abort.current?.abort();
    onClose();
  });
  useEffect(() => () => abort.current?.abort(), []);

  const request: AiEditRequest = { kind, source: opened, selection, instruction };

  const start = async (text: string, retryProblems?: readonly string[]) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setView({ name: "working", phase: "drafting", received: 0 });
    setConfirmed(false);
    const outcome = await runAiEdit({
      request: { kind, source: opened, selection, instruction: text, previousProblems: retryProblems },
      provider: getAiAssistantState().provider,
      apiKey: getAiKey(),
      model: getAiAssistantState().model,
      getCurrentSource: () => liveSource.current,
      signal: controller.signal,
      onPhase: (phase) => setView((current) => (current.name === "working" ? { ...current, phase } : current)),
      onProgress: (progress) =>
        setView((current) =>
          current.name === "working" ? { ...current, received: progress.receivedCharacters } : current,
        ),
      send: requestAiEdit,
    });
    if (controller.signal.aborted && outcome.type !== "cancelled") return;
    setUsage(outcome.usage);
    if (outcome.type === "cancelled") setView({ name: "compose" });
    else if (outcome.type === "questions") {
      setAnswers(outcome.questions.map(() => ""));
      setView({ name: "questions", questions: outcome.questions });
    } else if (outcome.type === "failed")
      setView({ name: "failed", message: outcome.message, problems: outcome.problems });
    else {
      setSelectedGroups(new Set());
      setApplyError("");
      setView(outcome.rewrite ? { name: "confirm", outcome } : { name: "review", outcome });
    }
  };

  const canSend = instruction.trim().length > 0 && !readOnly;
  const working = view.name === "working";

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={dialog}
        className="ai-edit-dialog document-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI to change the selection"
      >
        <header>
          <h2>Ask AI to change the selection</h2>
          <p>
            Proposals are checked and shown for review. Nothing changes until you press Apply, and Apply is one undo
            step.
          </p>
        </header>

        {(view.name === "compose" || view.name === "working" || view.name === "failed") && (
          <section aria-label="Selection">
            <strong>{selection ? `Selected lines ${selection.startLine}–${selection.endLine}` : "No selection"}</strong>
            <pre className="ai-selection-preview">
              {selection ? selectedText : "The whole diagram is sent and may be changed."}
            </pre>
          </section>
        )}

        {(view.name === "compose" || view.name === "failed") && (
          <>
            <label>
              Instruction
              <textarea
                value={instruction}
                rows={3}
                maxLength={6000}
                placeholder="For example: add a timeout path to this call"
                onChange={(event) => setInstruction(event.target.value)}
              />
            </label>
            <WhatWillBeSent request={request} model={settings.model} provider={settings.provider} />
            <p>
              Model: {providerLabel}, {modelLabel}. Change it in Settings → AI assistant.
            </p>
            {readOnly && <p role="alert">This document is read-only.</p>}
          </>
        )}

        {view.name === "failed" && (
          <div role="alert" className="ai-edit-failure">
            <p>{view.message}</p>
            {view.problems.length > 1 && (
              <ul>
                {view.problems.slice(0, 5).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {working && (
          <p role="status" className="ai-edit-progress">
            {PHASE_TEXT[view.phase]}
            {view.phase === "drafting" && view.received > 0 ? ` ${view.received} characters received.` : ""}
          </p>
        )}

        {view.name === "questions" && (
          <section aria-label="Questions from the assistant">
            <p>The assistant needs more information before it changes anything.</p>
            {view.questions.map((question, index) => (
              <label key={question}>
                {question}
                <input
                  value={answers[index] ?? ""}
                  onChange={(event) =>
                    setAnswers(answers.map((value, at) => (at === index ? event.target.value : value)))
                  }
                />
              </label>
            ))}
          </section>
        )}

        {view.name === "confirm" && (
          <div role="alert" className="ai-edit-failure">
            <p>
              This proposal changes about {Math.round((view.outcome.rewrite?.share ?? 0) * 100)}% of the lines outside
              your selection ({view.outcome.rewrite?.changedLines} lines). Review it carefully before applying.
            </p>
          </div>
        )}

        {view.name === "review" && (
          <ProposalReview
            kind={kind}
            outcome={view.outcome}
            current={source}
            selection={selection}
            selectedGroups={selectedGroups}
            onSelectedGroupsChange={setSelectedGroups}
            applying={applying}
            applyError={applyError}
            readOnly={readOnly}
            confirmed={confirmed}
            onConfirmedChange={setConfirmed}
            onRenderFailed={(message) => setView({ name: "failed", message, problems: [] })}
            onInitialSelection={(initial) => setSelectedGroups(initial)}
            onApply={async (reviewed) => {
              setApplying(true);
              setApplyError("");
              try {
                const applied = await onApply(reviewed, source);
                if (applied) onClose();
                else
                  setApplyError(
                    "The change was not applied. The document or editing access changed; ask again to get a fresh proposal.",
                  );
              } catch {
                setApplyError("Could not apply the change. Your document was kept.");
              } finally {
                setApplying(false);
              }
            }}
          />
        )}

        {usage && view.name !== "working" && <p className="ai-edit-usage">{usageText(settings.model, usage)}</p>}

        <footer>
          {working && (
            <button type="button" onClick={() => abort.current?.abort()}>
              Cancel request
            </button>
          )}
          {view.name === "compose" && (
            <>
              <button type="button" onClick={onClose}>
                Close
              </button>
              <button type="button" disabled={!canSend} onClick={() => void start(instruction)}>
                Send
              </button>
            </>
          )}
          {view.name === "failed" && (
            <>
              <button type="button" onClick={onClose}>
                Close
              </button>
              <button type="button" onClick={() => setView({ name: "compose" })}>
                Edit instruction
              </button>
              <button type="button" disabled={!canSend} onClick={() => void start(instruction, view.problems)}>
                Try again
              </button>
            </>
          )}
          {view.name === "questions" && (
            <>
              <button type="button" onClick={() => setView({ name: "compose" })}>
                Edit instruction
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = instructionWithAnswers(instruction, view.questions, answers);
                  setInstruction(next);
                  void start(next);
                }}
              >
                Send answers
              </button>
            </>
          )}
          {view.name === "confirm" && (
            <>
              <button type="button" onClick={() => setView({ name: "compose" })}>
                Discard proposal
              </button>
              <button type="button" onClick={() => setView({ name: "review", outcome: view.outcome })}>
                Review anyway
              </button>
            </>
          )}
          {view.name === "review" && (
            <>
              <button type="button" onClick={onClose}>
                Discard
              </button>
              <button type="button" onClick={() => setView({ name: "compose" })}>
                Edit instruction
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function ProposalReview({
  kind,
  outcome,
  current,
  selection,
  selectedGroups,
  onSelectedGroupsChange,
  onInitialSelection,
  applying,
  applyError,
  readOnly,
  confirmed,
  onConfirmedChange,
  onRenderFailed,
  onApply,
}: {
  kind: DiagramKind;
  outcome: Extract<AiEditOutcome, { type: "proposal" }>;
  current: string;
  selection: AiSelection | undefined;
  selectedGroups: Set<string>;
  onSelectedGroupsChange(next: Set<string>): void;
  onInitialSelection(initial: Set<string>): void;
  applying: boolean;
  applyError: string;
  readOnly: boolean;
  confirmed: boolean;
  onConfirmedChange(value: boolean): void;
  onRenderFailed(message: string): void;
  onApply(reviewedSource: string): void;
}) {
  // After a rebase the selection no longer lines up with the current document, so nothing is marked outside.
  const review = useMemo(
    () => reviewProposal(kind, current, outcome.source, outcome.rebased ? undefined : selection),
    [kind, current, outcome.source, outcome.rebased, selection],
  );
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    onInitialSelection(review.initiallySelected);
  });
  const after = useProposalRenderCheck(outcome.source, kind);
  const before = useProposalRenderCheck(current, kind);
  useEffect(() => {
    if (after.state === "failed") onRenderFailed(after.message);
  }, [after, onRenderFailed]);
  const reviewed = useMemo(
    () => applyReviewGroups(current, review.groups, selectedGroups),
    [current, review.groups, selectedGroups],
  );
  const validation = useMemo(() => validateGeneratedSource(kind, current, reviewed), [kind, current, reviewed]);
  const hasOutside = review.outsideGroupIds.size > 0 || Boolean(outcome.rewrite);
  const selectsOutside = Boolean(outcome.rewrite) || [...selectedGroups].some((id) => review.outsideGroupIds.has(id));
  const ready = !applying && !readOnly && after.state === "ok";
  return (
    <section aria-label="Proposal review">
      <p className="ai-edit-summary">{outcome.summary}</p>
      {outcome.rebased && (
        <p role="status">The document changed while the assistant worked; the proposal was moved onto your edits.</p>
      )}
      {outcome.retried && <p role="status">Passed the checks on the second attempt.</p>}
      {outcome.warnings.length > 0 && (
        <p role="status">
          Adds {outcome.warnings.length} warning{outcome.warnings.length === 1 ? "" : "s"}: {outcome.warnings[0]}
        </p>
      )}
      <div className="ai-edit-previews">
        <figure aria-label="Before">
          <figcaption>Before</figcaption>
          {before.state === "ok" ? (
            <div className="ai-edit-preview" dangerouslySetInnerHTML={{ __html: before.svg }} />
          ) : (
            <p role="status">{before.state === "failed" ? before.message : "Rendering…"}</p>
          )}
        </figure>
        <figure aria-label="After (proposal)">
          <figcaption>After (proposal)</figcaption>
          {after.state === "ok" ? (
            <div className="ai-edit-preview" dangerouslySetInnerHTML={{ __html: after.svg }} />
          ) : (
            <p role="status">{after.state === "failed" ? after.message : "Rendering…"}</p>
          )}
        </figure>
      </div>
      <ReviewPanel
        groups={review.groups}
        diagramKind={kind}
        before={current}
        selectedGroups={selectedGroups}
        onSelectedGroupsChange={onSelectedGroupsChange}
        activeGroupId={undefined}
        visibleGroupIds={new Set()}
        outsideGroupIds={review.outsideGroupIds}
        heading="Proposed changes"
        description="Apply all changes, or select groups. Groups outside your selection start unchecked; unclassified changes can only be applied together with Apply all changes."
        emptyText="The proposal has no changes."
      >
        {!!selectedGroups.size && !validation.valid && (
          <p role="alert">{validation.message} Select related groups together.</p>
        )}
        {hasOutside && (
          <label className="version-import-warning">
            <input type="checkbox" checked={confirmed} onChange={(event) => onConfirmedChange(event.target.checked)} />I
            have reviewed the changes outside my selection.
          </label>
        )}
        {applyError && <p role="alert">{applyError}</p>}
        <div className="semantic-review-actions">
          <button type="button" disabled={!ready || (hasOutside && !confirmed)} onClick={() => onApply(outcome.source)}>
            {applying ? "Applying…" : "Apply all changes"}
          </button>
          <button
            type="button"
            disabled={!ready || !selectedGroups.size || !validation.valid || (selectsOutside && !confirmed)}
            onClick={() => onApply(reviewed)}
          >
            {`Apply selected (${selectedGroups.size})`}
          </button>
        </div>
      </ReviewPanel>
    </section>
  );
}
