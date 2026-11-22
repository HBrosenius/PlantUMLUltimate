import { requestAiEditDialog } from "./ai-edit-bridge";

/**
 * A visible way into "Ask AI to change the selection…" from a diagram toolbar or Stage. It uses the
 * current selection (source lines, or the selected task, message or participant); when the assistant
 * is off, the launcher opens Settings → AI assistant instead, so the feature can be discovered.
 */
export function AskAiButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ? `ask-ai-button ${className}` : "ask-ai-button"}
      data-inspector-trigger
      onClick={() => requestAiEditDialog()}
      title="Describe a change to the selection and review the AI's proposal before applying it"
    >
      Ask AI…
    </button>
  );
}
