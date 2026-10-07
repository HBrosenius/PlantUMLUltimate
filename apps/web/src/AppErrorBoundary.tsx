import { Component, type ErrorInfo, type ReactNode } from "react";
import { loadWorkspace } from "./workspace-storage";
import { serializeWorkspaceBackup } from "./workspace-backup";

interface State {
  error?: Error;
  backupFailed?: boolean;
}

/** Downloads the persisted workspace so users can keep their work after an unexpected failure. */
async function downloadWorkspaceBackup(): Promise<void> {
  const session = await loadWorkspace();
  const blob = new Blob([serializeWorkspaceBackup(session, [])], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `plantuml-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Replaces a blank screen after a render failure with recovery actions. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled application error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error, backupFailed } = this.state;
    if (!error) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          maxWidth: 560,
          margin: "10vh auto",
          padding: "0 16px",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p>
          The editor stopped because of an unexpected error. Your open documents are kept in browser storage and are
          usually restored when you reload.
        </p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, opacity: 0.8 }}>{error.message}</pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => window.location.reload()}>
            Reload editor
          </button>
          <button
            type="button"
            onClick={() => void downloadWorkspaceBackup().catch(() => this.setState({ backupFailed: true }))}
          >
            Download workspace backup
          </button>
        </div>
        {backupFailed && <p>The backup could not be read from browser storage.</p>}
      </main>
    );
  }
}
