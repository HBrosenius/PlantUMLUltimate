import { useLayoutEffect, useRef, useState } from "react";
import type { RenderStatus } from "./model";
import type { SequenceMessage, SequenceParticipant, SequenceStructure } from "@plantuml-studio/diagram-sequence";
import { useDiagramNavigation } from "./useDiagramNavigation";

export function SequenceDiagramPreview({
  svg,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
  participants,
  messages,
  structures,
  selectedParticipantId,
  selectedMessageId,
  selectedStructureId,
  onParticipantSelect,
  onMessageSelect,
  onStructureSelect,
  onParticipantReorder,
  onMessageReorder,
  onTimelineReorder,
  onMessageReconnect,
  onStructureReconnect,
  onMessageCreate,
  onMessageExternalize,
}: {
  svg?: string | undefined;
  zoom: number;
  onZoomChange(zoom: number): void;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  participants: readonly SequenceParticipant[];
  messages: readonly SequenceMessage[];
  structures: readonly SequenceStructure[];
  selectedParticipantId?: string | undefined;
  selectedMessageId?: string | undefined;
  selectedStructureId?: string | undefined;
  onParticipantSelect(id: string): void;
  onMessageSelect(id: string): void;
  onStructureSelect(id: string): void;
  onParticipantReorder(id: string, targetId: string, placement?: "before" | "after"): void;
  onMessageReorder(id: string, targetId: string, placement?: "before" | "after"): void;
  onTimelineReorder(id: string, targetId: string, placement?: "before" | "after"): void;
  onMessageReconnect(messageId: string, endpoint: "from" | "to", participantId: string): void;
  onStructureReconnect(structureId: string, endpoint: number, participantId: string): void;
  onMessageCreate(fromParticipantId: string, toParticipantId: string): void;
  onMessageExternalize(messageId: string, endpoint: "from" | "to", marker: "[" | "]" | "?"): void;
}) {
  const navigation = useDiagramNavigation(zoom, onZoomChange);
  const diagramRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | {
        kind: "participant" | "message" | "message-endpoint" | "structure" | "structure-endpoint";
        id: string;
        endpoint?: "from" | "to";
        structureEndpoint?: number;
        participantTargetId?: string;
        participantTargets?: Array<{ id: string; x: number }>;
        timelineTargetId?: string;
        timelineTargets?: Array<{ id: string; y: number }>;
        x: number;
        y: number;
        currentX: number;
        currentY: number;
        create: boolean;
        element: Element;
        label: string;
        reconnectPreview?: {
          svg: SVGSVGElement;
          line: SVGLineElement;
          head: SVGPolygonElement;
          endpoint: "from" | "to";
          fixedX: number;
          fixedY: number;
        };
        movePreview?: {
          svg: SVGSVGElement;
          line: SVGLineElement;
          head: SVGPolygonElement;
          x1: number;
          x2: number;
        };
        structureMovePreview?: {
          svg: SVGSVGElement;
          layer: SVGGElement;
          startX: number;
          startY: number;
        };
      }
    | undefined
  >(undefined);
  const suppressClickRef = useRef(false);
  const dragFeedbackRef = useRef<HTMLOutputElement>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const [orderTrayOpen, setOrderTrayOpen] = useState(false);
  const [trayDrag, setTrayDrag] = useState<{ kind: "participant" | "message" | "structure"; id: string }>();
  const selectedParticipant = participants.find((participant) => participant.id === selectedParticipantId);
  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const selectedStructure = structures.find((structure) => structure.id === selectedStructureId);

  useLayoutEffect(() => {
    const root = diagramRef.current;
    if (!root) return;
    root
      .querySelectorAll("[data-sequence-drag-hit], .sequence-selected-structure")
      .forEach((element) => element.remove());
    for (const text of root.querySelectorAll<SVGTextElement>("text")) {
      text.removeAttribute("data-sequence-participant-id");
      text.removeAttribute("data-sequence-message-id");
      text.removeAttribute("data-sequence-structure-id");
      text.removeAttribute("data-draggable");
      text.removeAttribute("aria-label");
      const content = text.textContent?.trim() ?? "";
      const participant = participants.find((item) => content === item.label || content === (item.alias ?? item.label));
      if (participant) {
        text.setAttribute("data-sequence-participant-id", participant.id);
        text.setAttribute("data-draggable", "true");
        text.setAttribute("aria-label", `Drag participant ${participant.label} sideways to reorder`);
        addDragHitTarget(
          text,
          "data-sequence-participant-id",
          participant.id,
          `Drag participant ${participant.label}`,
          30,
          18,
          false,
        );
      } else {
        const message = messages.find((item) => item.label && (content === item.label || content.endsWith(item.label)));
        if (message) {
          text.setAttribute("data-sequence-message-id", message.id);
          text.setAttribute("data-draggable", "true");
          text.setAttribute("aria-label", `Drag message ${message.label || "unlabelled"} vertically to reorder`);
          addDragHitTarget(text, "data-sequence-message-id", message.id, `Drag message ${message.label}`, 18, 11, true);
        } else {
          const structure = structures.find((item) =>
            structureTextTokens(item).some((token) => token && (content === token || content.includes(token))),
          );
          if (structure) {
            text.setAttribute("data-sequence-structure-id", structure.id);
            text.setAttribute("data-draggable", "true");
            text.setAttribute("aria-label", `Drag ${structureLabel(structure)} vertically to reorder`);
            addDragHitTarget(
              text,
              "data-sequence-structure-id",
              structure.id,
              `Drag ${structureLabel(structure)}`,
              18,
              11,
              true,
            );
          }
        }
      }
    }
    addStructureTimelineGrips(root, structures, selectedStructureId);
    addMessageReconnectAnchors(root, participants, messages, selectedMessageId);
    addStructureReconnectAnchors(root, participants, structures, selectedStructureId);
    restoreActiveReconnectPreview(root);
    const frame = window.requestAnimationFrame(() => restoreActiveReconnectPreview(root));
    return () => window.cancelAnimationFrame(frame);

    function restoreActiveReconnectPreview(currentRoot: HTMLDivElement) {
      const drag = dragRef.current;
      if (drag?.kind !== "message-endpoint" || !drag.endpoint) return;
      const handle = currentRoot.querySelector<SVGCircleElement>(
        `[data-sequence-message-id="${CSS.escape(drag.id)}"][data-sequence-message-endpoint="${drag.endpoint}"]`,
      );
      if (!handle) return;
      drag.reconnectPreview?.line.remove();
      drag.reconnectPreview?.head.remove();
      const preview = createReconnectPreview(currentRoot, handle, drag.endpoint, drag.id, participants, messages);
      drag.element = handle;
      if (preview) {
        drag.reconnectPreview = preview;
        updateReconnectPreview(preview, drag.currentX, drag.currentY);
      } else delete drag.reconnectPreview;
    }
  });

  const selectRenderedObject = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const target = event.target as Element;
    const participantId = target
      .closest("[data-sequence-participant-id]")
      ?.getAttribute("data-sequence-participant-id");
    if (participantId) {
      onParticipantSelect(participantId);
      return;
    }
    const messageId = target.closest("[data-sequence-message-id]")?.getAttribute("data-sequence-message-id");
    if (messageId) {
      onMessageSelect(messageId);
      return;
    }
    const structureId = target.closest("[data-sequence-structure-id]")?.getAttribute("data-sequence-structure-id");
    if (structureId) {
      onStructureSelect(structureId);
      return;
    }
    const text = target.closest("text")?.textContent?.trim();
    if (!text) return;
    const participant = participants.find((item) => text === item.label || text === (item.alias ?? item.label));
    if (participant) {
      onParticipantSelect(participant.id);
      return;
    }
    const message = messages.find((item) => item.label && (text === item.label || text.endsWith(item.label)));
    if (message) onMessageSelect(message.id);
    else {
      const structure = structures.find((item) =>
        structureTextTokens(item).some((token) => token && (text === token || text.includes(token))),
      );
      if (structure) onStructureSelect(structure.id);
    }
  };

  const selectRenderedObjectByKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as Element;
    const participantId = target
      .closest("[data-sequence-participant-id]")
      ?.getAttribute("data-sequence-participant-id");
    const messageId = target.closest("[data-sequence-message-id]")?.getAttribute("data-sequence-message-id");
    const structureId = target.closest("[data-sequence-structure-id]")?.getAttribute("data-sequence-structure-id");
    if (!participantId && !messageId && !structureId) return;
    event.preventDefault();
    if (participantId) onParticipantSelect(participantId);
    else if (messageId) onMessageSelect(messageId);
    else if (structureId) onStructureSelect(structureId);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    const endpointHandle = target.closest("[data-sequence-message-endpoint]");
    const endpoint = endpointHandle?.getAttribute("data-sequence-message-endpoint") as "from" | "to" | null;
    const endpointMessageId = endpointHandle?.getAttribute("data-sequence-message-id");
    const structureEndpointHandle = target.closest("[data-sequence-structure-endpoint]");
    const structureEndpoint = Number(structureEndpointHandle?.getAttribute("data-sequence-structure-endpoint"));
    const endpointStructureId = structureEndpointHandle?.getAttribute("data-sequence-structure-id");
    const participantId = target
      .closest("[data-sequence-participant-id]")
      ?.getAttribute("data-sequence-participant-id");
    const messageId = target.closest("[data-sequence-message-id]")?.getAttribute("data-sequence-message-id");
    const structureId = target.closest("[data-sequence-structure-id]")?.getAttribute("data-sequence-structure-id");
    if (!participantId && !messageId && !endpointMessageId && !structureId && !endpointStructureId) return;
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    const element = structureEndpointHandle ?? endpointHandle ?? target.closest("text") ?? target;
    const reconnectPreview =
      endpointHandle instanceof SVGCircleElement && endpoint && endpointMessageId
        ? createReconnectPreview(
            diagramRef.current,
            endpointHandle,
            endpoint,
            endpointMessageId,
            participants,
            messages,
          )
        : undefined;
    const movePreview =
      !endpointMessageId && messageId
        ? createMessageMovePreview(diagramRef.current, messageId, participants, messages)
        : undefined;
    const structureMovePreview =
      structureId && !endpointStructureId
        ? createStructureMovePreview(diagramRef.current, structureId, event.clientX, event.clientY)
        : undefined;
    dragRef.current = {
      kind: endpointStructureId
        ? "structure-endpoint"
        : endpointMessageId
          ? "message-endpoint"
          : participantId
            ? "participant"
            : structureId
              ? "structure"
              : "message",
      id: endpointStructureId ?? endpointMessageId ?? participantId ?? structureId ?? messageId!,
      ...(endpoint ? { endpoint } : {}),
      ...(endpointStructureId ? { structureEndpoint } : {}),
      ...(endpointStructureId || endpointMessageId
        ? { participantTargets: participantTargetPositions(diagramRef.current) }
        : {}),
      ...((structureId || messageId) && !endpointStructureId && !endpointMessageId
        ? { timelineTargets: timelineTargetPositions(diagramRef.current) }
        : {}),
      x: event.clientX,
      y: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      create: Boolean(participantId && event.shiftKey),
      element,
      label: endpointStructureId
        ? "Structure participant endpoint"
        : endpoint
          ? `${endpoint === "from" ? "Sender" : "Receiver"} endpoint`
          : element.textContent?.trim() || (participantId ? "Participant" : "Message"),
      ...(reconnectPreview ? { reconnectPreview } : {}),
      ...(movePreview ? { movePreview } : {}),
      ...(structureMovePreview ? { structureMovePreview } : {}),
    };
    const activeDrag = dragRef.current;
    if (activeDrag.kind === "message-endpoint" && activeDrag.endpoint) {
      const keepPreviewAttached = () => {
        if (dragRef.current !== activeDrag || !activeDrag.endpoint) return;
        if (!activeDrag.reconnectPreview?.line.isConnected) {
          const handle = diagramRef.current?.querySelector<SVGCircleElement>(
            `[data-sequence-message-id="${CSS.escape(activeDrag.id)}"][data-sequence-message-endpoint="${activeDrag.endpoint}"]`,
          );
          if (handle) {
            const preview = createReconnectPreview(
              diagramRef.current,
              handle,
              activeDrag.endpoint,
              activeDrag.id,
              participants,
              messages,
            );
            activeDrag.element = handle;
            if (preview) {
              activeDrag.reconnectPreview = preview;
              updateReconnectPreview(preview, activeDrag.currentX, activeDrag.currentY);
            }
          } else onMessageSelect(activeDrag.id);
        }
        window.requestAnimationFrame(keepPreviewAttached);
      };
      window.requestAnimationFrame(keepPreviewAttached);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    if (drag.kind === "message-endpoint" && drag.endpoint && !drag.reconnectPreview?.line.isConnected) {
      const handle = diagramRef.current?.querySelector<SVGCircleElement>(
        `[data-sequence-message-id="${CSS.escape(drag.id)}"][data-sequence-message-endpoint="${drag.endpoint}"]`,
      );
      if (handle) {
        const preview = createReconnectPreview(
          diagramRef.current,
          handle,
          drag.endpoint,
          drag.id,
          participants,
          messages,
        );
        drag.element = handle;
        if (preview) drag.reconnectPreview = preview;
      }
    }
    if (drag.reconnectPreview) updateReconnectPreview(drag.reconnectPreview, event.clientX, event.clientY);
    if (drag.movePreview) updateMessageMovePreview(drag.movePreview, event.clientX, event.clientY);
    if (drag.structureMovePreview) updateStructureMovePreview(drag.structureMovePreview, event.clientX, event.clientY);
    if (drag.kind === "message-endpoint" || drag.kind === "structure-endpoint") {
      const participantTargetId = nearestParticipantAtX(
        diagramRef.current,
        event.clientX,
        drag.id,
        drag.participantTargets,
      );
      if (participantTargetId) drag.participantTargetId = participantTargetId;
      else delete drag.participantTargetId;
    }
    if ((drag.kind === "message" || drag.kind === "structure") && Math.abs(dy) >= Math.abs(dx)) {
      const timelineTargetId = nearestTimelineAtY(event.clientY, drag.id, drag.timelineTargets);
      if (timelineTargetId) drag.timelineTargetId = timelineTargetId;
      else delete drag.timelineTargetId;
    }
    drag.element.classList.add("sequence-dragging");
    if (dragGhostRef.current) {
      dragGhostRef.current.textContent = drag.label;
      dragGhostRef.current.hidden = false;
      dragGhostRef.current.style.transform = `translate3d(${event.clientX + 12}px, ${event.clientY + 12}px, 0)`;
    }
    const feedback = drag.create
      ? "Drop on a participant to create a message"
      : drag.kind === "participant"
        ? "Drop on a participant to reorder"
        : drag.kind === "message-endpoint"
          ? `Drop the ${drag.endpoint === "from" ? "sender" : "receiver"} handle on a participant anchor`
          : drag.kind === "structure-endpoint"
            ? `Drop this attachment handle on ${participants.find((item) => item.id === drag.participantTargetId)?.label ?? "a participant anchor"}`
            : Math.abs(dx) > Math.abs(dy)
              ? drag.kind === "message"
                ? "Drop on a participant to reconnect this endpoint"
                : "Drag vertically to reorder"
              : "Drop on another timeline element to reorder";
    if (dragFeedbackRef.current) {
      dragFeedbackRef.current.textContent = feedback;
      dragFeedbackRef.current.hidden = false;
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = undefined;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.element.classList.remove("sequence-dragging");
    drag.reconnectPreview?.line.remove();
    drag.reconnectPreview?.head.remove();
    drag.movePreview?.line.remove();
    drag.movePreview?.head.remove();
    drag.structureMovePreview?.layer.remove();
    if (dragGhostRef.current) {
      dragGhostRef.current.textContent = "";
      dragGhostRef.current.hidden = true;
      dragGhostRef.current.style.removeProperty("transform");
    }
    if (dragFeedbackRef.current) {
      dragFeedbackRef.current.textContent = "";
      dragFeedbackRef.current.hidden = true;
    }
    if (event.type === "pointercancel") return;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) {
      if (drag.kind === "participant") onParticipantSelect(drag.id);
      else if (drag.kind === "message" || drag.kind === "message-endpoint") onMessageSelect(drag.id);
      else onStructureSelect(drag.id);
      return;
    }
    const previousPointerEvents = (drag.element as SVGElement).style.pointerEvents;
    (drag.element as SVGElement).style.pointerEvents = "none";
    const drop = document.elementFromPoint(event.clientX, event.clientY);
    (drag.element as SVGElement).style.pointerEvents = previousPointerEvents;
    let participantId = drop?.closest("[data-sequence-participant-id]")?.getAttribute("data-sequence-participant-id");
    if (!participantId && (drag.kind === "message-endpoint" || drag.kind === "structure-endpoint"))
      participantId = drag.participantTargetId;
    if (
      (!participantId || participantId === drag.id) &&
      (drag.kind === "participant" ||
        drag.kind === "message-endpoint" ||
        drag.kind === "structure-endpoint" ||
        (drag.kind === "message" && Math.abs(dx) > Math.abs(dy)))
    ) {
      const nearest = [
        ...(diagramRef.current?.querySelectorAll<SVGGraphicsElement>("[data-sequence-participant-id]") ?? []),
      ]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-sequence-participant-id"),
            distance: Math.abs(rect.left + rect.width / 2 - event.clientX),
          };
        })
        .filter((item) => item.id !== drag.id)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest?.id && nearest.distance < 80) participantId = nearest.id;
    }
    let timelineId =
      drop?.closest("[data-sequence-message-id]")?.getAttribute("data-sequence-message-id") ??
      drop?.closest("[data-sequence-structure-id]")?.getAttribute("data-sequence-structure-id");
    if ((drag.kind === "message" || drag.kind === "structure") && Math.abs(dy) >= Math.abs(dx) && drag.timelineTargetId)
      timelineId = drag.timelineTargetId;
    if (
      (drag.kind === "message" || drag.kind === "structure") &&
      Math.abs(dy) >= Math.abs(dx) &&
      (!timelineId || timelineId === drag.id)
    ) {
      const nearest = [
        ...(diagramRef.current?.querySelectorAll<SVGGraphicsElement>(
          "[data-sequence-message-id], [data-sequence-structure-id]",
        ) ?? []),
      ]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-sequence-message-id") ?? element.getAttribute("data-sequence-structure-id"),
            distance: Math.abs(rect.top + rect.height / 2 - event.clientY),
          };
        })
        .filter((item) => item.id && item.id !== drag.id)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest?.id && nearest.distance < 80) timelineId = nearest.id;
    }
    if (drag.kind === "participant") {
      if (!participantId || participantId === drag.id) return;
      suppressClickRef.current = true;
      if (drag.create || event.shiftKey) onMessageCreate(drag.id, participantId);
      else {
        const target = diagramRef.current?.querySelector<SVGGraphicsElement>(
          `[data-sequence-drag-hit][data-sequence-participant-id="${CSS.escape(participantId)}"]`,
        );
        const targetBox = target?.getBoundingClientRect();
        const placement = targetBox && event.clientX > targetBox.left + targetBox.width / 2 + 4 ? "after" : "before";
        onParticipantReorder(drag.id, participantId, placement);
      }
      return;
    }
    if (drag.kind === "message-endpoint") {
      if (participantId && drag.endpoint) {
        suppressClickRef.current = true;
        onMessageReconnect(drag.id, drag.endpoint, participantId);
      }
      return;
    }
    if (drag.kind === "structure-endpoint") {
      if (participantId && drag.structureEndpoint !== undefined) {
        suppressClickRef.current = true;
        onStructureReconnect(drag.id, drag.structureEndpoint, participantId);
      }
      return;
    }
    if (timelineId && timelineId !== drag.id && Math.abs(dy) >= Math.abs(dx)) {
      suppressClickRef.current = true;
      const target = diagramRef.current?.querySelector<SVGGraphicsElement>(
        `[data-sequence-drag-hit][data-sequence-message-id="${CSS.escape(timelineId)}"], [data-sequence-drag-hit][data-sequence-structure-id="${CSS.escape(timelineId)}"]`,
      );
      const placement =
        target && event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2
          ? "after"
          : "before";
      onTimelineReorder(drag.id, timelineId, placement);
    } else if (participantId && drag.kind === "message") {
      suppressClickRef.current = true;
      onMessageReconnect(drag.id, dx < 0 ? "from" : "to", participantId);
    }
  };
  return (
    <section className="preview" aria-label="Sequence diagram preview">
      <div className="preview-tools">
        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => onZoomChange(1)} aria-label={`Reset zoom, ${Math.round(zoom * 100)}%`}>
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} aria-label="Zoom in">
          +
        </button>
        <button
          className={orderTrayOpen ? "active" : ""}
          aria-expanded={orderTrayOpen}
          aria-controls="sequence-order-tray"
          onClick={() => setOrderTrayOpen((open) => !open)}
        >
          Reorder
        </button>
        {(selectedParticipant || selectedMessage || selectedStructure) && (
          <span className="sequence-selection-label">
            {selectedParticipant
              ? `Participant: ${selectedParticipant.label}`
              : selectedMessage
                ? `Message: ${selectedMessage.label || "(unlabelled)"}`
                : `Element: ${structureLabel(selectedStructure!)}`}
          </span>
        )}
        <span className="sequence-drag-hint">Drag participants sideways · timeline elements vertically</span>
        {selectedMessage && (
          <span className="sequence-edge-actions">
            <button onClick={() => onMessageExternalize(selectedMessage.id, "from", "[")}>From edge</button>
            <button onClick={() => onMessageExternalize(selectedMessage.id, "to", "]")}>To edge</button>
            <button onClick={() => onMessageExternalize(selectedMessage.id, "to", "?")}>Mark lost</button>
          </span>
        )}
      </div>
      {orderTrayOpen && (
        <aside id="sequence-order-tray" className="sequence-order-tray" aria-label="Reorder Sequence items">
          <OrderList
            title="Participants"
            kind="participant"
            items={participants.map((participant) => ({ id: participant.id, label: participant.label }))}
            dragged={trayDrag}
            onDrag={setTrayDrag}
            onReorder={onParticipantReorder}
          />
          <OrderList
            title="Messages"
            kind="message"
            items={messages.map((message, index) => ({
              id: message.id,
              label: message.label || `${message.from} ${message.arrow} ${message.to} · Message ${index + 1}`,
            }))}
            dragged={trayDrag}
            onDrag={setTrayDrag}
            onReorder={onMessageReorder}
          />
          <OrderList
            title="Other elements"
            kind="structure"
            items={structures.map((structure) => ({ id: structure.id, label: structureLabel(structure) }))}
            dragged={trayDrag}
            onDrag={setTrayDrag}
            onReorder={onTimelineReorder}
          />
        </aside>
      )}
      <div
        className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}
        ref={navigation.viewportRef}
        onWheel={navigation.onWheel}
        onPointerDown={navigation.onPointerDown}
        onAuxClick={navigation.onAuxClick}
      >
        {svg ? (
          <div
            className="diagram sequence-diagram"
            ref={diagramRef}
            data-inspector-trigger
            style={{ transform: `scale(${zoom})` }}
            onClick={selectRenderedObject}
            onKeyDown={selectRenderedObjectByKeyboard}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : renderError ? (
          <div className="render-error" role="alert">
            <strong>Could not render this Sequence diagram.</strong>
            <p>{renderError}</p>
            <button onClick={onRenderRetry}>Retry</button>
          </div>
        ) : (
          <div className="render-placeholder">
            {renderStatus === "rendering"
              ? "Rendering Sequence diagram…"
              : "Enter Sequence diagram source to render a preview."}
          </div>
        )}
      </div>
      <output ref={dragFeedbackRef} className="interaction-feedback" hidden />
      <div ref={dragGhostRef} className="sequence-drag-ghost" aria-hidden="true" hidden />
    </section>
  );
}

function participantTargetPositions(root: HTMLDivElement | null): Array<{ id: string; x: number }> {
  const anchors = [
    ...(root?.querySelectorAll<SVGGraphicsElement>(".sequence-participant-anchor[data-sequence-participant-id]") ?? []),
  ];
  const candidates = anchors.length
    ? anchors
    : [...(root?.querySelectorAll<SVGGraphicsElement>("text[data-sequence-participant-id]") ?? [])];
  return candidates.flatMap((element) => {
    const id = element.getAttribute("data-sequence-participant-id");
    if (!id) return [];
    const rect = element.getBoundingClientRect();
    return [{ id, x: rect.left + rect.width / 2 }];
  });
}

function timelineTargetPositions(root: HTMLDivElement | null): Array<{ id: string; y: number }> {
  const positions = new Map<string, number>();
  for (const element of root?.querySelectorAll<SVGGraphicsElement>(
    "[data-sequence-drag-hit][data-sequence-message-id], .sequence-structure-grip[data-sequence-structure-id]",
  ) ?? []) {
    const id = element.getAttribute("data-sequence-message-id") ?? element.getAttribute("data-sequence-structure-id");
    if (!id || positions.has(id)) continue;
    const rect = element.getBoundingClientRect();
    positions.set(id, rect.top + rect.height / 2);
  }
  return [...positions].map(([id, y]) => ({ id, y }));
}

function nearestTimelineAtY(clientY: number, excludedId: string, targets: Array<{ id: string; y: number }> = []) {
  return targets
    .filter((item) => item.id !== excludedId)
    .sort((a, b) => Math.abs(a.y - clientY) - Math.abs(b.y - clientY))[0]?.id;
}

function nearestParticipantAtX(
  root: HTMLDivElement | null,
  clientX: number,
  excludedId?: string,
  targets = participantTargetPositions(root),
): string | undefined {
  return targets
    .map((element) => {
      return { id: element.id, distance: Math.abs(element.x - clientX) };
    })
    .filter((item) => item.id && item.id !== excludedId)
    .sort((a, b) => a.distance - b.distance)[0]?.id;
}

function createStructureMovePreview(
  root: HTMLDivElement | null,
  structureId: string,
  clientX: number,
  clientY: number,
) {
  const svg = root?.querySelector<SVGSVGElement>("svg");
  if (!root || !svg) return undefined;
  const texts = [
    ...root.querySelectorAll<SVGTextElement>(`text[data-sequence-structure-id="${CSS.escape(structureId)}"]`),
  ];
  const grip = root.querySelector<SVGGraphicsElement>(
    `.sequence-structure-grip[data-sequence-structure-id="${CSS.escape(structureId)}"]`,
  );
  const measured: SVGGraphicsElement[] = texts.length ? texts : grip ? [grip] : [];
  if (!measured.length) return undefined;
  try {
    const textBoxes = measured.map((element) => element.getBBox());
    const textLeft = Math.min(...textBoxes.map((box) => box.x));
    const textTop = Math.min(...textBoxes.map((box) => box.y));
    const textRight = Math.max(...textBoxes.map((box) => box.x + box.width));
    const textBottom = Math.max(...textBoxes.map((box) => box.y + box.height));
    const center = { x: (textLeft + textRight) / 2, y: (textTop + textBottom) / 2 };
    const siblings = texts[0]?.parentElement
      ? [
          ...texts[0].parentElement.querySelectorAll<SVGGraphicsElement>(
            ":scope > path, :scope > rect, :scope > polygon, :scope > line, :scope > text",
          ),
        ]
      : [];
    const enclosure = siblings
      .filter(
        (element) =>
          ["path", "rect", "polygon"].includes(element.tagName.toLowerCase()) &&
          !element.hasAttribute("data-sequence-drag-hit"),
      )
      .map((element) => ({ element, box: element.getBBox() }))
      .filter(
        ({ box }) =>
          box.x <= center.x && box.x + box.width >= center.x && box.y <= center.y && box.y + box.height >= center.y,
      )
      .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];
    const visualElements = enclosure
      ? siblings.filter((element) => {
          if (element.hasAttribute("data-sequence-drag-hit") || element.classList.contains("sequence-structure-grip"))
            return false;
          const box = element.getBBox();
          const bounds = enclosure.box;
          return (
            box.x >= bounds.x - 1 &&
            box.x + box.width <= bounds.x + bounds.width + 1 &&
            box.y >= bounds.y - 1 &&
            box.y + box.height <= bounds.y + bounds.height + 1
          );
        })
      : [];
    const visualBoxes = visualElements.length ? visualElements.map((element) => element.getBBox()) : textBoxes;
    const left = Math.min(...visualBoxes.map((box) => box.x));
    const top = Math.min(...visualBoxes.map((box) => box.y));
    const right = Math.max(...visualBoxes.map((box) => box.x + box.width));
    const bottom = Math.max(...visualBoxes.map((box) => box.y + box.height));
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.setAttribute("class", "sequence-structure-move-preview");
    if (visualElements.length) {
      const frame = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      frame.setAttribute("x", String(left - 3));
      frame.setAttribute("y", String(top - 3));
      frame.setAttribute("width", String(right - left + 6));
      frame.setAttribute("height", String(bottom - top + 6));
      frame.setAttribute("rx", "5");
      frame.setAttribute("class", "sequence-structure-move-preview-frame");
      layer.appendChild(frame);
      for (const element of visualElements) {
        const clone = element.cloneNode(true) as SVGGraphicsElement;
        for (const annotated of [clone, ...clone.querySelectorAll("*")]) {
          annotated.removeAttribute("data-sequence-structure-id");
          annotated.removeAttribute("data-sequence-message-id");
          annotated.removeAttribute("data-sequence-participant-id");
          annotated.removeAttribute("data-draggable");
          annotated.removeAttribute("aria-label");
          annotated.removeAttribute("id");
        }
        layer.appendChild(clone);
      }
    } else {
      const backdrop = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      backdrop.setAttribute("x", String(left - 12));
      backdrop.setAttribute("y", String(top - 8));
      backdrop.setAttribute("width", String(Math.max(80, right - left + 24)));
      backdrop.setAttribute("height", String(Math.max(30, bottom - top + 16)));
      backdrop.setAttribute("rx", "6");
      backdrop.setAttribute("class", "sequence-structure-move-preview-card");
      layer.appendChild(backdrop);
      for (const text of texts) {
        const clone = text.cloneNode(true) as SVGTextElement;
        clone.removeAttribute("data-sequence-structure-id");
        clone.removeAttribute("data-draggable");
        clone.removeAttribute("aria-label");
        layer.appendChild(clone);
      }
    }
    if (!texts.length) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(left + 20));
      label.setAttribute("y", String(top + 12));
      label.setAttribute("class", "sequence-structure-move-preview-label");
      label.textContent =
        grip
          ?.getAttribute("aria-label")
          ?.replace(/^Drag /, "")
          .replace(/ vertically$/, "") || "Sequence element";
      layer.appendChild(label);
    }
    svg.appendChild(layer);
    return { svg, layer, startX: clientX, startY: clientY };
  } catch {
    return undefined;
  }
}

function updateStructureMovePreview(
  preview: { svg: SVGSVGElement; layer: SVGGElement; startX: number; startY: number },
  clientX: number,
  clientY: number,
) {
  const matrix = preview.svg.getScreenCTM();
  if (!matrix) return;
  const inverse = matrix.inverse();
  const start = new DOMPoint(preview.startX, preview.startY).matrixTransform(inverse);
  const current = new DOMPoint(clientX, clientY).matrixTransform(inverse);
  preview.layer.setAttribute("transform", `translate(${current.x - start.x} ${current.y - start.y})`);
}

function structureLabel(structure: SequenceStructure): string {
  if (structure.id.startsWith("fragment-") && "label" in structure) return `Fragment: ${structure.label || "fragment"}`;
  if (structure.id.startsWith("activation-") && "participant" in structure)
    return `Activation: ${structure.participant}`;
  if (structure.id.startsWith("note-") && "text" in structure)
    return `Note: ${structure.text.split("\n")[0] || "note"}`;
  if (structure.id.startsWith("reference-") && "text" in structure)
    return `Reference: ${structure.text.split("\n")[0] || "reference"}`;
  if (structure.id.startsWith("box-") && "label" in structure) return `Participant box: ${structure.label || "box"}`;
  if (structure.id.startsWith("creation-") && "participant" in structure) return `Create ${structure.participant}`;
  if (structure.id.startsWith("duration-") && "label" in structure) return `Duration: ${structure.label || "duration"}`;
  if (structure.id.startsWith("autonumber-")) return "Autonumber";
  if ("label" in structure)
    return `${"kind" in structure ? structure.kind : "Element"}: ${structure.label || "unlabelled"}`;
  return "Sequence element";
}

function structureTextTokens(structure: SequenceStructure): string[] {
  if (structure.id.startsWith("note-") || structure.id.startsWith("reference-"))
    return "text" in structure
      ? structure.text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  if (structure.id.startsWith("fragment-") || structure.id.startsWith("box-") || structure.id.startsWith("duration-"))
    return "label" in structure && structure.label ? [structure.label] : [];
  if ("label" in structure && structure.label) return [structure.label];
  return [];
}

function structureParticipants(structure: SequenceStructure): string[] {
  if ((structure.id.startsWith("note-") || structure.id.startsWith("reference-")) && "participants" in structure)
    return structure.participants;
  if ((structure.id.startsWith("activation-") || structure.id.startsWith("creation-")) && "participant" in structure)
    return [structure.participant];
  return [];
}

function addStructureTimelineGrips(
  root: HTMLDivElement,
  structures: readonly SequenceStructure[],
  selectedStructureId: string | undefined,
) {
  const svg = root.querySelector<SVGSVGElement>("svg");
  if (!svg || !structures.length) return;
  const viewBox = svg.viewBox.baseVal;
  const top = viewBox.y + 48;
  const available = Math.max(40, viewBox.height - 88);
  const ordered = [...structures].sort((a, b) => a.sourceRange.from - b.sourceRange.from);
  ordered.forEach((structure, index) => {
    const text = root.querySelector<SVGTextElement>(`text[data-sequence-structure-id="${CSS.escape(structure.id)}"]`);
    const textBox = text?.getBBox();
    const y = textBox ? textBox.y + textBox.height / 2 : top + available * ((index + 1) / (ordered.length + 1));
    const grip = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    grip.setAttribute("x", String(viewBox.x + 5));
    grip.setAttribute("y", String(y - 7));
    grip.setAttribute("width", "14");
    grip.setAttribute("height", "14");
    grip.setAttribute("rx", "4");
    grip.setAttribute("class", `sequence-structure-grip${structure.id === selectedStructureId ? " selected" : ""}`);
    grip.setAttribute("data-sequence-drag-hit", "true");
    grip.setAttribute("data-sequence-structure-id", structure.id);
    grip.setAttribute("tabindex", "0");
    grip.setAttribute("role", "button");
    grip.setAttribute("aria-label", `Drag ${structureLabel(structure)} vertically`);
    svg.appendChild(grip);
  });
}

function addStructureReconnectAnchors(
  root: HTMLDivElement,
  participants: readonly SequenceParticipant[],
  structures: readonly SequenceStructure[],
  selectedStructureId: string | undefined,
) {
  if (!selectedStructureId) return;
  const structure = structures.find((item) => item.id === selectedStructureId);
  const structureText =
    root.querySelector<SVGGraphicsElement>(`text[data-sequence-structure-id="${CSS.escape(selectedStructureId)}"]`) ??
    root.querySelector<SVGGraphicsElement>(
      `.sequence-structure-grip[data-sequence-structure-id="${CSS.escape(selectedStructureId)}"]`,
    );
  const svg = structureText?.ownerSVGElement;
  if (!structure || !structureText || !svg) return;
  try {
    const box = structureText.getBBox();
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    outline.setAttribute("x", String(box.x - 8));
    outline.setAttribute("y", String(box.y - 6));
    outline.setAttribute("width", String(Math.max(30, box.width + 16)));
    outline.setAttribute("height", String(Math.max(24, box.height + 12)));
    outline.setAttribute("class", "sequence-selected-structure");
    outline.setAttribute("data-sequence-structure-id", structure.id);
    svg.appendChild(outline);
    const owners = structureParticipants(structure);
    if (!owners.length) return;
    const y = box.y + box.height / 2;
    const positions = participants.flatMap((participant) => {
      const text = root.querySelector<SVGTextElement>(
        `text[data-sequence-participant-id="${CSS.escape(participant.id)}"]`,
      );
      if (!text) return [];
      const participantBox = text.getBBox();
      return [{ participant, x: participantBox.x + participantBox.width / 2 }];
    });
    for (const { participant, x } of positions) {
      const anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      anchor.setAttribute("cx", String(x));
      anchor.setAttribute("cy", String(y));
      anchor.setAttribute("r", "7");
      anchor.setAttribute("class", "sequence-participant-anchor sequence-structure-participant-anchor");
      anchor.setAttribute("data-sequence-participant-id", participant.id);
      anchor.setAttribute("data-sequence-drag-hit", "true");
      svg.appendChild(anchor);
    }
    owners.forEach((owner, endpoint) => {
      const position = positions.find(({ participant }) => (participant.alias ?? participant.label) === owner);
      if (!position) return;
      const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      handle.setAttribute("cx", String(position.x));
      handle.setAttribute("cy", String(y));
      handle.setAttribute("r", "9");
      handle.setAttribute("class", "sequence-structure-endpoint");
      handle.setAttribute("data-sequence-structure-id", structure.id);
      handle.setAttribute("data-sequence-structure-endpoint", String(endpoint));
      handle.setAttribute("data-sequence-drag-hit", "true");
      handle.setAttribute("aria-label", `Drag attachment ${endpoint + 1}`);
      svg.appendChild(handle);
    });
  } catch {
    // The inspector and reorder tray remain available if the renderer exposes no measurable geometry.
  }
}

function addMessageReconnectAnchors(
  root: HTMLDivElement,
  participants: readonly SequenceParticipant[],
  messages: readonly SequenceMessage[],
  selectedMessageId: string | undefined,
) {
  if (!selectedMessageId) return;
  const message = messages.find((item) => item.id === selectedMessageId);
  const messageText = root.querySelector<SVGTextElement>(
    `text[data-sequence-message-id="${CSS.escape(selectedMessageId)}"]`,
  );
  const svg = messageText?.ownerSVGElement;
  if (!message || !messageText || !svg) return;
  try {
    const messageBox = messageText.getBBox();
    const y = messageBox.y + messageBox.height + 6;
    const positions = participants
      .map((participant) => {
        const text = root.querySelector<SVGTextElement>(
          `text[data-sequence-participant-id="${CSS.escape(participant.id)}"]`,
        );
        if (!text) return undefined;
        const box = text.getBBox();
        return { participant, x: box.x + box.width / 2 };
      })
      .filter((item): item is { participant: SequenceParticipant; x: number } => Boolean(item));

    const fromOwner = positions.find(({ participant }) => (participant.alias ?? participant.label) === message.from);
    const toOwner = positions.find(({ participant }) => (participant.alias ?? participant.label) === message.to);
    if (fromOwner && toOwner) {
      const selectedLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      selectedLine.setAttribute("x1", String(fromOwner.x));
      selectedLine.setAttribute("y1", String(y));
      selectedLine.setAttribute("x2", String(toOwner.x));
      selectedLine.setAttribute("y2", String(y));
      selectedLine.setAttribute("class", "sequence-selected-message-line");
      selectedLine.setAttribute("data-sequence-drag-hit", "true");
      if (message.arrow.includes("--")) selectedLine.setAttribute("stroke-dasharray", "7 4");
      const selectedHead = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const direction = toOwner.x >= fromOwner.x ? 1 : -1;
      const back = toOwner.x - direction * 11;
      selectedHead.setAttribute("points", `${toOwner.x},${y} ${back},${y - 6} ${back},${y + 6}`);
      selectedHead.setAttribute("class", "sequence-selected-message-head");
      selectedHead.setAttribute("data-sequence-drag-hit", "true");
      svg.append(selectedLine, selectedHead);
    }

    for (const { participant, x } of positions) {
      const anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      anchor.setAttribute("cx", String(x));
      anchor.setAttribute("cy", String(y));
      anchor.setAttribute("r", "7");
      anchor.setAttribute("class", "sequence-participant-anchor");
      anchor.setAttribute("data-sequence-drag-hit", "true");
      anchor.setAttribute("data-sequence-participant-id", participant.id);
      anchor.setAttribute("aria-label", `Reconnect to ${participant.label}`);
      svg.appendChild(anchor);
    }

    for (const endpoint of ["from", "to"] as const) {
      const reference = message[endpoint];
      const owner = positions.find(({ participant }) => (participant.alias ?? participant.label) === reference);
      if (!owner) continue;
      const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      handle.setAttribute("cx", String(owner.x));
      handle.setAttribute("cy", String(y));
      handle.setAttribute("r", "9");
      handle.setAttribute("class", `sequence-message-endpoint sequence-message-endpoint-${endpoint}`);
      handle.setAttribute("data-sequence-drag-hit", "true");
      handle.setAttribute("data-sequence-message-id", message.id);
      handle.setAttribute("data-sequence-message-endpoint", endpoint);
      handle.setAttribute("aria-label", `Drag ${endpoint === "from" ? "sender" : "receiver"} endpoint`);
      svg.appendChild(handle);
    }
  } catch {
    // The regular message inspector remains available if an SVG implementation cannot expose geometry.
  }
}

function createReconnectPreview(
  root: HTMLDivElement | null,
  handle: SVGCircleElement,
  endpoint: "from" | "to",
  messageId: string,
  participants: readonly SequenceParticipant[],
  messages: readonly SequenceMessage[],
) {
  const svg = handle.ownerSVGElement;
  if (!svg) return undefined;
  const message = messages.find((item) => item.id === messageId);
  if (!message) return undefined;
  const fixedReference = message[endpoint === "from" ? "to" : "from"];
  const fixedParticipant = participants.find((item) => (item.alias ?? item.label) === fixedReference);
  const fixedParticipantText = fixedParticipant
    ? root?.querySelector<SVGTextElement>(`text[data-sequence-participant-id="${CSS.escape(fixedParticipant.id)}"]`)
    : undefined;
  const draggedX = Number(handle.getAttribute("cx"));
  const draggedY = Number(handle.getAttribute("cy"));
  const fixedBox = fixedParticipantText?.getBBox();
  const fixedX = fixedBox
    ? fixedBox.x + fixedBox.width / 2
    : endpoint === "from"
      ? svg.viewBox.baseVal.x + svg.viewBox.baseVal.width - 8
      : svg.viewBox.baseVal.x + 8;
  const fixedY = draggedY;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(endpoint === "to" ? fixedX : draggedX));
  line.setAttribute("y1", String(endpoint === "to" ? fixedY : draggedY));
  line.setAttribute("x2", String(endpoint === "to" ? draggedX : fixedX));
  line.setAttribute("y2", String(endpoint === "to" ? draggedY : fixedY));
  line.setAttribute("class", "sequence-reconnect-preview");
  const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  head.setAttribute("class", "sequence-reconnect-preview-head");
  svg.append(line, head);
  return { svg, line, head, endpoint, fixedX, fixedY };
}

function updateReconnectPreview(
  preview: {
    svg: SVGSVGElement;
    line: SVGLineElement;
    head: SVGPolygonElement;
    endpoint: "from" | "to";
    fixedX: number;
    fixedY: number;
  },
  clientX: number,
  clientY: number,
) {
  const matrix = preview.svg.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  const start = preview.endpoint === "to" ? { x: preview.fixedX, y: preview.fixedY } : point;
  const end = preview.endpoint === "to" ? point : { x: preview.fixedX, y: preview.fixedY };
  preview.line.setAttribute("x1", String(start.x));
  preview.line.setAttribute("y1", String(start.y));
  preview.line.setAttribute("x2", String(end.x));
  preview.line.setAttribute("y2", String(end.y));
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const size = 10;
  const wing = 5;
  const backX = end.x - Math.cos(angle) * size;
  const backY = end.y - Math.sin(angle) * size;
  const perpendicularX = -Math.sin(angle) * wing;
  const perpendicularY = Math.cos(angle) * wing;
  preview.head.setAttribute(
    "points",
    `${end.x},${end.y} ${backX + perpendicularX},${backY + perpendicularY} ${backX - perpendicularX},${backY - perpendicularY}`,
  );
}

function createMessageMovePreview(
  root: HTMLDivElement | null,
  messageId: string,
  participants: readonly SequenceParticipant[],
  messages: readonly SequenceMessage[],
) {
  const message = messages.find((item) => item.id === messageId);
  const messageText = root?.querySelector<SVGTextElement>(`text[data-sequence-message-id="${CSS.escape(messageId)}"]`);
  const svg = messageText?.ownerSVGElement;
  if (!message || !messageText || !svg) return undefined;
  const viewBox = svg.viewBox.baseVal;
  const participantX = (reference: string, edge: "from" | "to") => {
    const participant = participants.find((item) => (item.alias ?? item.label) === reference);
    const text = participant
      ? root?.querySelector<SVGTextElement>(`text[data-sequence-participant-id="${CSS.escape(participant.id)}"]`)
      : undefined;
    if (text) {
      const box = text.getBBox();
      return box.x + box.width / 2;
    }
    return edge === "from" ? viewBox.x + 8 : viewBox.x + viewBox.width - 8;
  };
  const x1 = participantX(message.from, "from");
  const x2 = participantX(message.to, "to");
  const box = messageText.getBBox();
  const y = box.y + box.height + 6;
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y1", String(y));
  line.setAttribute("y2", String(y));
  line.setAttribute("class", "sequence-message-move-preview");
  if (message.arrow.includes("--")) line.setAttribute("stroke-dasharray", "7 4");
  const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  head.setAttribute("class", "sequence-message-move-preview-head");
  svg.append(line, head);
  updateMessageMoveArrowhead(head, x1, x2, y);
  return { svg, line, head, x1, x2 };
}

function updateMessageMovePreview(
  preview: { svg: SVGSVGElement; line: SVGLineElement; head: SVGPolygonElement; x1: number; x2: number },
  clientX: number,
  clientY: number,
) {
  const matrix = preview.svg.getScreenCTM();
  if (!matrix) return;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  preview.line.setAttribute("y1", String(point.y));
  preview.line.setAttribute("y2", String(point.y));
  updateMessageMoveArrowhead(preview.head, preview.x1, preview.x2, point.y);
}

function updateMessageMoveArrowhead(head: SVGPolygonElement, x1: number, x2: number, y: number) {
  const direction = x2 >= x1 ? 1 : -1;
  const tip = x2;
  const back = tip - direction * 11;
  head.setAttribute("points", `${tip},${y} ${back},${y - 6} ${back},${y + 6}`);
}

function OrderList({
  title,
  kind,
  items,
  dragged,
  onDrag,
  onReorder,
}: {
  title: string;
  kind: "participant" | "message" | "structure";
  items: readonly { id: string; label: string }[];
  dragged?: { kind: "participant" | "message" | "structure"; id: string } | undefined;
  onDrag(value: { kind: "participant" | "message" | "structure"; id: string } | undefined): void;
  onReorder(id: string, targetId: string, placement?: "before" | "after"): void;
}) {
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: "before" | "after" }>();
  return (
    <section aria-label={`${title} order`}>
      <strong>{title}</strong>
      <div className="sequence-order-list">
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`sequence-order-item${dragged?.kind === kind && dragged.id === item.id ? " dragging" : ""}`}
            data-drop-placement={dropTarget?.id === item.id ? dropTarget.placement : undefined}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", `${kind}:${item.id}`);
              onDrag({ kind, id: item.id });
            }}
            onDragEnd={() => {
              onDrag(undefined);
              setDropTarget(undefined);
            }}
            onDragOver={(event) => {
              if (dragged?.kind === kind && dragged.id !== item.id) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  id: item.id,
                  placement: event.clientY > bounds.top + bounds.height / 2 ? "after" : "before",
                });
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(undefined);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged?.kind === kind && dragged.id !== item.id) {
                const bounds = event.currentTarget.getBoundingClientRect();
                onReorder(dragged.id, item.id, event.clientY > bounds.top + bounds.height / 2 ? "after" : "before");
              }
              setDropTarget(undefined);
              onDrag(undefined);
            }}
          >
            <span className="sequence-order-grip" aria-hidden="true">
              ⠿
            </span>
            <span>{item.label}</span>
            <small>{index + 1}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function addDragHitTarget(
  text: SVGTextElement,
  attribute: "data-sequence-participant-id" | "data-sequence-message-id" | "data-sequence-structure-id",
  id: string,
  label: string,
  horizontalPadding: number,
  verticalPadding: number,
  fullRow: boolean,
) {
  try {
    const box = text.getBBox();
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const svg = text.ownerSVGElement;
    const viewBox = svg?.viewBox.baseVal;
    rect.setAttribute("x", String(fullRow && viewBox?.width ? viewBox.x : box.x - horizontalPadding));
    rect.setAttribute("y", String(box.y - verticalPadding));
    rect.setAttribute(
      "width",
      String(fullRow && viewBox?.width ? viewBox.width : Math.max(52, box.width + horizontalPadding * 2)),
    );
    rect.setAttribute("height", String(Math.max(24, box.height + verticalPadding * 2)));
    rect.setAttribute("data-sequence-drag-hit", "true");
    rect.setAttribute(attribute, id);
    rect.setAttribute("data-draggable", "true");
    rect.setAttribute("aria-label", label);
    rect.setAttribute("tabindex", "0");
    rect.setAttribute("role", "button");
    const transform = text.getAttribute("transform");
    if (transform) rect.setAttribute("transform", transform);
    // Appending makes the transparent target the topmost SVG hit surface while leaving the diagram visible.
    (svg ?? text.parentElement)?.appendChild(rect);
  } catch {
    // Some SVG implementations cannot measure text until after first paint; the text itself remains draggable.
  }
}
