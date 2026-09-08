import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { findTaskAt, parseGantt } from "@plantuml-studio/diagram-gantt";
import {
  CollaborationSession,
  collaborationLinkDetails,
  collaborationShareUrl,
  createCollaborationOwnerToken,
  createCollaborationRoomId,
  withoutCollaborationLink,
  type CollaborationConnection,
  type CollaborationParticipant,
  type CollaborationRole,
} from "./collaboration";
import { detectDiagramKind } from "./diagram-kind";
import type { DiagramKind } from "./model";
import type { DocumentVersionOverride, RecordDocumentVersion } from "./use-document-versions";
import type { DocumentSnapshot, WorkspaceSnapshot } from "./workspace-storage";

export type ActiveCollaboration = {
  documentId: string;
  roomId: string;
  endpoint: string;
  shareUrl: string;
  viewerShareUrl?: string | undefined;
  participantId: string;
  participantName: string;
  owner: boolean;
  role: CollaborationRole;
  connection: CollaborationConnection;
  participants: CollaborationParticipant[];
};

export type RemoteEditFlash = {
  participantId: string;
  name: string;
  color: string;
  range: { from: number; to: number };
  taskId?: string | undefined;
};

type TabControls = {
  activeId: string;
  documents: DocumentSnapshot[];
  updateDocumentSource: (id: string, source: string, diagramKind: DiagramKind) => void;
};

type Options = {
  hydrated: boolean;
  defaultEndpoint: string;
  workspace: WorkspaceSnapshot;
  tabs: TabControls;
  recordDocumentVersion: RecordDocumentVersion;
  reportError: (error: unknown) => void;
  setInteractionMessage: Dispatch<SetStateAction<string | undefined>>;
};

export function normalizeCollaborationEndpoint(endpoint: string, allowHttp: boolean): string | undefined {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) return undefined;
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function useCollaborationLifecycle({
  hydrated,
  defaultEndpoint,
  workspace,
  tabs,
  recordDocumentVersion,
  reportError,
  setInteractionMessage,
}: Options) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingCollaboration, setPendingCollaboration] = useState<{
    roomId: string;
    endpoint: string;
    accessToken?: string | undefined;
    role: CollaborationRole;
  }>();
  const [collaboration, setCollaboration] = useState<ActiveCollaboration>();
  const [remoteEditFlash, setRemoteEditFlash] = useState<RemoteEditFlash>();
  const sessionRef = useRef<CollaborationSession | undefined>(undefined);
  const remoteEditFlashTimer = useRef<number | undefined>(undefined);
  const pendingVersion = useRef<
    | {
        author: { id: string; name: string; color: string };
        source: string;
        historyId: string;
        fileName: string;
        diagramKind: DiagramKind;
        timer: number;
      }
    | undefined
  >(undefined);
  const flushVersionRef = useRef<() => void>(() => undefined);

  const savePendingVersion = useCallback(
    (pending: Omit<NonNullable<typeof pendingVersion.current>, "timer">) => {
      void recordDocumentVersion("collaboration", undefined, pending).catch(reportError);
    },
    [recordDocumentVersion, reportError],
  );
  const flushVersion = useCallback(() => {
    const pending = pendingVersion.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingVersion.current = undefined;
    savePendingVersion(pending);
  }, [savePendingVersion]);
  flushVersionRef.current = flushVersion;

  const scheduleVersion = useCallback(
    (
      participant: CollaborationParticipant,
      source: string,
      details: Omit<DocumentVersionOverride, "author" | "source">,
    ) => {
      const author = { id: participant.id, name: participant.name, color: participant.color };
      const existing = pendingVersion.current;
      if (existing) {
        window.clearTimeout(existing.timer);
        if (existing.author.id !== author.id) savePendingVersion(existing);
      }
      const pending = { author, source, ...details, timer: 0 } as NonNullable<typeof pendingVersion.current>;
      pending.timer = window.setTimeout(() => {
        if (pendingVersion.current !== pending) return;
        pendingVersion.current = undefined;
        savePendingVersion(pending);
      }, 1_200);
      pendingVersion.current = pending;
    },
    [savePendingVersion],
  );

  const leaveCollaboration = useCallback(() => {
    flushVersion();
    sessionRef.current?.stop();
    sessionRef.current = undefined;
    setCollaboration(undefined);
    setDialogOpen(false);
    window.clearTimeout(remoteEditFlashTimer.current);
    setRemoteEditFlash(undefined);
    window.history.replaceState({}, "", withoutCollaborationLink(window.location.href));
    setInteractionMessage("Left collaboration room");
  }, [flushVersion, setInteractionMessage]);

  const startCollaboration = useCallback(
    (
      name: string,
      endpoint: string,
      requestedRoomId?: string,
      requestedAccessToken?: string,
      requestedRole: CollaborationRole = "editor",
    ) => {
      const normalizedEndpoint = normalizeCollaborationEndpoint(endpoint, import.meta.env.DEV);
      if (!normalizedEndpoint) {
        setInteractionMessage("Collaboration service needs a valid HTTPS URL");
        return;
      }
      const roomId = requestedRoomId ?? createCollaborationRoomId();
      const ownerToken = requestedRoomId ? undefined : createCollaborationOwnerToken();
      const editorToken = requestedRoomId ? undefined : createCollaborationRoomId();
      const viewerToken = requestedRoomId ? undefined : createCollaborationRoomId();
      const role = requestedRoomId ? requestedRole : "editor";
      if (!/^[A-Za-z0-9_-]{43}$/.test(roomId)) {
        setInteractionMessage("The collaboration link contains an invalid room credential");
        return;
      }
      if (requestedAccessToken && !/^[A-Za-z0-9_-]{43}$/.test(requestedAccessToken)) {
        setInteractionMessage("The collaboration link contains an invalid access credential");
        return;
      }
      sessionRef.current?.stop();
      const documentId = tabs.activeId;
      const collaborationDocument = tabs.documents.find((document) => document.id === documentId)!;
      const participantId = localStorage.getItem("plantuml-studio.collaboration-participant") ?? crypto.randomUUID();
      localStorage.setItem("plantuml-studio.collaboration-participant", participantId);
      const colors = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2"];
      const color =
        colors[[...participantId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % colors.length]!;
      const shareUrl = collaborationShareUrl(
        window.location.href,
        normalizedEndpoint,
        roomId,
        editorToken ?? requestedAccessToken,
        role,
      );
      const viewerShareUrl = viewerToken
        ? collaborationShareUrl(window.location.href, normalizedEndpoint, roomId, viewerToken, "viewer")
        : undefined;
      void recordDocumentVersion("opened", "Collaboration started", {
        historyId: collaborationDocument.historyId,
        source: workspace.source,
        fileName: collaborationDocument.fileName,
        diagramKind: collaborationDocument.diagramKind,
      }).catch(reportError);
      const session = new CollaborationSession(
        normalizedEndpoint,
        roomId,
        workspace.source,
        { id: participantId, name, color, cursor: workspace.cursor, selection: { anchor: 0, head: 0 } },
        (source) => tabs.updateDocumentSource(documentId, source, detectDiagramKind(source) ?? "gantt"),
        (connection) => setCollaboration((current) => (current ? { ...current, connection } : current)),
        (participants) => setCollaboration((current) => (current ? { ...current, participants } : current)),
        (participant, source, range) => {
          scheduleVersion(participant, source, {
            historyId: collaborationDocument.historyId,
            fileName: collaborationDocument.fileName,
            diagramKind: detectDiagramKind(source) ?? collaborationDocument.diagramKind,
          });
          if (participant.id === participantId) return;
          window.clearTimeout(remoteEditFlashTimer.current);
          const diagramKind = detectDiagramKind(source) ?? collaborationDocument.diagramKind;
          const editPosition = Math.min(range.from, Math.max(0, source.length - 1));
          const taskId =
            diagramKind === "gantt"
              ? (
                  parseGantt(source).document.tasks.find(
                    (task) => editPosition >= task.sourceRange.from && editPosition <= task.sourceRange.to,
                  ) ?? findTaskAt(parseGantt(source).document, editPosition)
                )?.id
              : undefined;
          setRemoteEditFlash({
            participantId: participant.id,
            name: participant.name,
            color: participant.color,
            range,
            taskId,
          });
          remoteEditFlashTimer.current = window.setTimeout(() => setRemoteEditFlash(undefined), 2_500);
        },
        role,
        ownerToken && editorToken && viewerToken
          ? { ownerToken, editorToken, viewerToken, accessToken: editorToken }
          : { accessToken: requestedAccessToken },
      );
      sessionRef.current = session;
      setCollaboration({
        documentId,
        roomId,
        endpoint: normalizedEndpoint,
        shareUrl,
        viewerShareUrl,
        participantId,
        participantName: name,
        owner: Boolean(ownerToken),
        role,
        connection: "connecting",
        participants: [],
      });
      setPendingCollaboration(undefined);
      setDialogOpen(true);
      window.history.replaceState({}, "", new URL(shareUrl));
      setInteractionMessage(requestedRoomId ? "Joining collaboration room…" : "Created private collaboration room");
    },
    [
      recordDocumentVersion,
      reportError,
      scheduleVersion,
      setInteractionMessage,
      tabs,
      workspace.cursor,
      workspace.source,
    ],
  );

  const rotateCollaborationRoom = useCallback(async () => {
    if (!collaboration?.owner || !sessionRef.current) return;
    try {
      await sessionRef.current.revokeRoom();
    } catch (error) {
      setInteractionMessage(error instanceof Error ? error.message : "Could not revoke collaboration link");
      return;
    }
    sessionRef.current.stop();
    sessionRef.current = undefined;
    startCollaboration(collaboration.participantName, collaboration.endpoint);
    setInteractionMessage("Old collaboration link revoked; created a new private room");
  }, [collaboration, setInteractionMessage, startCollaboration]);

  useEffect(() => {
    if (!hydrated || collaboration) return;
    const details = collaborationLinkDetails(window.location.href);
    const roomId = details.roomId;
    const endpoint = details.endpoint ?? defaultEndpoint;
    if (!roomId || !endpoint) return;
    setPendingCollaboration({ roomId, endpoint, accessToken: details.accessToken, role: details.role });
    setDialogOpen(true);
  }, [collaboration, defaultEndpoint, hydrated]);

  useEffect(() => {
    if (collaboration?.documentId === tabs.activeId) sessionRef.current?.applySource(workspace.source);
  }, [collaboration?.documentId, tabs.activeId, workspace.source]);

  useEffect(() => {
    if (collaboration && !tabs.documents.some((document) => document.id === collaboration.documentId))
      leaveCollaboration();
  }, [collaboration, leaveCollaboration, tabs.documents]);

  useEffect(
    () => () => {
      flushVersionRef.current();
      sessionRef.current?.stop();
      window.clearTimeout(remoteEditFlashTimer.current);
    },
    [],
  );

  const updateSelection = useCallback((line: number, column: number, anchor: number, head: number) => {
    sessionRef.current?.updateSelection(line, column, anchor, head);
  }, []);

  return {
    collaboration,
    pendingCollaboration,
    remoteEditFlash,
    collaborationDialogOpen: dialogOpen,
    setCollaborationDialogOpen: setDialogOpen,
    startCollaboration,
    rotateCollaborationRoom,
    leaveCollaboration,
    updateSelection,
  };
}
