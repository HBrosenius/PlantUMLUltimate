/**
 * Two small channels between the app and the AI edit launcher, so entry points deep in the tree (the
 * source editor, the Sequence preview) need no prop drilling:
 * - the source editor reports its selection here;
 * - any entry point asks for the dialog to open with a character range.
 */
export interface AiEditRange {
  from: number;
  to: number;
}

let editorSelection: AiEditRange | undefined;

export function reportEditorSelection(anchor: number, head: number): void {
  editorSelection = anchor === head ? undefined : { from: Math.min(anchor, head), to: Math.max(anchor, head) };
}

/** The non-empty editor selection, valid for `sourceLength`, or undefined. */
export function currentEditorSelection(sourceLength: number): AiEditRange | undefined {
  return editorSelection && editorSelection.to <= sourceLength ? editorSelection : undefined;
}

type Listener = (range: AiEditRange | undefined) => void;
const listeners = new Set<Listener>();

/** Entry points call this; the launcher in the app listens. */
export function requestAiEditDialog(range?: AiEditRange): void {
  for (const listener of listeners) listener(range);
}

export function onAiEditDialogRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
