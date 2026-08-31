import { useEffect, useRef, useState } from "react";
import type { CollaborationConnection, CollaborationParticipant, CollaborationRole } from "./collaboration";
import { useDialogFocus } from "./use-dialog-focus";

export function CollaborationDialog({
  pendingRoom,
  pendingAccessToken,
  pendingRole = "editor",
  defaultEndpoint,
  active,
  onStart,
  onRotate,
  onLeave,
  onClose,
}: {
  pendingRoom?: string | undefined;
  pendingAccessToken?: string | undefined;
  pendingRole?: CollaborationRole | undefined;
  defaultEndpoint: string;
  active?:
    | {
        roomId: string;
        shareUrl: string;
        viewerShareUrl?: string | undefined;
        owner: boolean;
        role: CollaborationRole;
        connection: CollaborationConnection;
        participants: CollaborationParticipant[];
      }
    | undefined;
  onStart(name: string, endpoint: string, roomId?: string, accessToken?: string, role?: CollaborationRole): void;
  onRotate(): void;
  onLeave(): void;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(() => localStorage.getItem("plantuml-studio.collaboration-name") ?? "");
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [copied, setCopied] = useState<CollaborationRole | undefined>();
  const [copyFailed, setCopyFailed] = useState<CollaborationRole | undefined>();
  const [confirmRotation, setConfirmRotation] = useState(false);
  const closeDialog = confirmRotation ? () => setConfirmRotation(false) : onClose;
  useDialogFocus(dialog, closeDialog);
  useEffect(() => setEndpoint(defaultEndpoint), [defaultEndpoint]);

  return (
    <div className="modal-backdrop" onMouseDown={closeDialog}>
      <div
        ref={dialog}
        className="collaboration-dialog"
        role={confirmRotation ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={confirmRotation ? "Revoke collaboration link" : "Collaboration"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>
              {confirmRotation
                ? "Revoke collaboration link?"
                : active
                  ? "Collaboration room"
                  : pendingRoom
                    ? "Join collaboration"
                    : "Start collaboration"}
            </h2>
            <p>
              {confirmRotation
                ? "This action cannot be undone."
                : active
                  ? active.role === "viewer"
                    ? "You can follow live changes, but only editors can modify this document."
                    : "Anyone with the private editor link can edit this document."
                  : "Live edits stay synchronized while each participant keeps an offline local copy."}
            </p>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label={confirmRotation ? "Cancel link revocation" : "Close collaboration"}
          >
            ×
          </button>
        </header>
        {confirmRotation && active ? (
          <div className="collaboration-confirmation">
            <p>
              The current link will stop working immediately and everyone in this room will be disconnected. Your
              current document will continue in a new room with a new private link.
            </p>
            <div className="dialog-actions">
              <button type="button" autoFocus onClick={() => setConfirmRotation(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirmRotation(false);
                  onRotate();
                }}
              >
                Revoke and create new link
              </button>
            </div>
          </div>
        ) : active ? (
          <>
            <div className={`collaboration-state ${active.connection}`}>
              {active.connection === "connected"
                ? "Connected"
                : active.connection === "connecting"
                  ? "Connecting…"
                  : "Offline · edits will synchronize after reconnecting"}
            </div>
            {active.role === "viewer" && <strong className="collaboration-viewer-badge">Viewing only</strong>}
            <CollaborationLink
              label={active.role === "viewer" ? "Viewer link" : "Editor link"}
              url={active.shareUrl}
              copied={copied === active.role}
              failed={copyFailed === active.role}
              onCopy={() => {
                void navigator.clipboard.writeText(active.shareUrl).then(
                  () => {
                    setCopied(active.role);
                    setCopyFailed(undefined);
                  },
                  () => setCopyFailed(active.role),
                );
              }}
            />
            {active.owner && active.viewerShareUrl && (
              <CollaborationLink
                label="Viewer link"
                url={active.viewerShareUrl}
                copied={copied === "viewer"}
                failed={copyFailed === "viewer"}
                onCopy={() => {
                  void navigator.clipboard.writeText(active.viewerShareUrl!).then(
                    () => {
                      setCopied("viewer");
                      setCopyFailed(undefined);
                    },
                    () => setCopyFailed("viewer"),
                  );
                }}
              />
            )}
            <section className="collaboration-participants" aria-label="Connected participants">
              <h3>{active.participants.length} online</h3>
              {active.participants.map((participant) => (
                <div key={participant.id}>
                  <span style={{ background: participant.color }} aria-hidden="true" />
                  <strong>{participant.name}</strong>
                  <small>{participant.role === "viewer" ? "Viewer" : "Editor"}</small>
                  {participant.cursor && (
                    <small>
                      Ln {participant.cursor.line}, Col {participant.cursor.column}
                    </small>
                  )}
                </div>
              ))}
            </section>
            <div className="dialog-actions">
              {active.owner && (
                <button type="button" onClick={() => setConfirmRotation(true)}>
                  Revoke link and create new
                </button>
              )}
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
              onStart(trimmedName, trimmedEndpoint, pendingRoom, pendingAccessToken, pendingRole);
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
              {pendingRole === "viewer"
                ? "This viewer link follows live changes without permission to edit."
                : "The editor link is an editing credential. Share it only with people who may change the document."}
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary">
                {pendingRoom ? (pendingRole === "viewer" ? "Join as viewer" : "Join as editor") : "Create private room"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CollaborationLink({
  label,
  url,
  copied,
  failed,
  onCopy,
}: {
  label: string;
  url: string;
  copied: boolean;
  failed: boolean;
  onCopy(): void;
}) {
  return (
    <div className="collaboration-link-row">
      <label>
        {label}
        <input readOnly aria-label={label} value={url} />
      </label>
      <button type="button" onClick={onCopy}>
        {copied ? "Copied!" : failed ? "Copy failed" : `Copy ${label.toLowerCase()}`}
      </button>
    </div>
  );
}
