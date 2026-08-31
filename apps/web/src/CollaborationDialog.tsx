import { useEffect, useRef, useState } from "react";
import type { CollaborationConnection, CollaborationParticipant } from "./collaboration";
import { useDialogFocus } from "./use-dialog-focus";

export function CollaborationDialog({
  pendingRoom,
  defaultEndpoint,
  active,
  onStart,
  onLeave,
  onClose,
}: {
  pendingRoom?: string | undefined;
  defaultEndpoint: string;
  active?:
    | {
        roomId: string;
        shareUrl: string;
        connection: CollaborationConnection;
        participants: CollaborationParticipant[];
      }
    | undefined;
  onStart(name: string, endpoint: string, roomId?: string): void;
  onLeave(): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const [name, setName] = useState(() => localStorage.getItem("plantuml-studio.collaboration-name") ?? "");
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => setEndpoint(defaultEndpoint), [defaultEndpoint]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialog}
        className="collaboration-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Collaboration"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{active ? "Collaboration room" : pendingRoom ? "Join collaboration" : "Start collaboration"}</h2>
            <p>
              {active
                ? "Anyone with the private room link can edit this document."
                : "Live edits stay synchronized while each participant keeps an offline local copy."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close collaboration">
            ×
          </button>
        </header>
        {active ? (
          <>
            <div className={`collaboration-state ${active.connection}`}>
              {active.connection === "connected"
                ? "Connected"
                : active.connection === "connecting"
                  ? "Connecting…"
                  : "Offline · edits will synchronize after reconnecting"}
            </div>
            <div className="collaboration-share">
              <input readOnly aria-label="Private collaboration link" value={active.shareUrl} />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(active.shareUrl).then(
                    () => {
                      setCopied(true);
                      setCopyFailed(false);
                    },
                    () => setCopyFailed(true),
                  );
                }}
              >
                {copied ? "Copied!" : copyFailed ? "Copy failed" : "Copy link"}
              </button>
            </div>
            <section className="collaboration-participants" aria-label="Connected participants">
              <h3>{active.participants.length} online</h3>
              {active.participants.map((participant) => (
                <div key={participant.id}>
                  <span style={{ background: participant.color }} aria-hidden="true" />
                  <strong>{participant.name}</strong>
                  {participant.cursor && (
                    <small>
                      Ln {participant.cursor.line}, Col {participant.cursor.column}
                    </small>
                  )}
                </div>
              ))}
            </section>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Close
              </button>
              <button type="button" className="danger" onClick={onLeave}>
                Leave room
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmedName = name.trim();
              const trimmedEndpoint = endpoint.trim();
              if (!trimmedName || !trimmedEndpoint) return;
              localStorage.setItem("plantuml-studio.collaboration-name", trimmedName);
              localStorage.setItem("plantuml-studio.collaboration-server", trimmedEndpoint);
              onStart(trimmedName, trimmedEndpoint, pendingRoom);
            }}
          >
            <label>
              Your name
              <input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Collaboration service
              <input
                required
                type="url"
                placeholder="https://collaboration.example.workers.dev"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
              />
            </label>
            <p className="collaboration-privacy">
              The room link is the editing credential. Share it only with people who may change the document.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary">
                {pendingRoom ? "Join room" : "Create private room"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
