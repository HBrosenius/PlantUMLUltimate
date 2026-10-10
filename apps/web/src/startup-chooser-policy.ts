import type { WorkspaceSession } from "./workspace-storage";

/** Only the untouched initial welcome tab may be replaced by startup creation. */
export function startupChooserPolicy(session: WorkspaceSession) {
  const initial =
    session.documents.length === 1 &&
    session.documents[0]?.historyId === "history-welcome" &&
    session.documents[0]?.fileCopy === "new" &&
    !session.documents[0]?.dirty;
  if (initial) return "replace-welcome";
  return session.startupMode === "chooser" ? "add-diagram" : undefined;
}
