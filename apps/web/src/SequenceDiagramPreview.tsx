import { useLayoutEffect, useRef, useState } from "react";
import type { RenderStatus } from "./model";
import type { SequenceMessage, SequenceParticipant } from "@plantuml-studio/diagram-sequence";

export function SequenceDiagramPreview({
  svg,
  zoom,
  onZoomChange,
  renderStatus,
  renderError,
  onRenderRetry,
  participants,
  messages,
  selectedParticipantId,
  selectedMessageId,
  onParticipantSelect,
  onMessageSelect,
  onParticipantReorder,
  onMessageReorder,
  onMessageReconnect,
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
  selectedParticipantId?: string | undefined;
  selectedMessageId?: string | undefined;
  onParticipantSelect(id: string): void;
  onMessageSelect(id: string): void;
  onParticipantReorder(id: string, targetId: string, placement?: "before" | "after"): void;
  onMessageReorder(id: string, targetId: string, placement?: "before" | "after"): void;
  onMessageReconnect(messageId: string, endpoint: "from" | "to", participantId: string): void;
  onMessageCreate(fromParticipantId: string, toParticipantId: string): void;
  onMessageExternalize(messageId: string, endpoint: "from" | "to", marker: "[" | "]" | "?"): void;
}) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    | {
        kind: "participant" | "message" | "message-endpoint";
        id: string;
        endpoint?: "from" | "to";
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
      }
    | undefined
  >(undefined);
  const suppressClickRef = useRef(false);
  const dragFeedbackRef = useRef<HTMLOutputElement>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const [orderTrayOpen, setOrderTrayOpen] = useState(false);
  const [trayDrag, setTrayDrag] = useState<{ kind: "participant" | "message"; id: string }>();
  const selectedParticipant = participants.find((participant) => participant.id === selectedParticipantId);
  const selectedMessage = messages.find((message) => message.id === selectedMessageId);

  useLayoutEffect(() => {
    const root = diagramRef.current;
    if (!root) return;
    root.querySelectorAll("[data-sequence-drag-hit]").forEach((element) => element.remove());
    for (const text of root.querySelectorAll<SVGTextElement>("text")) {
      text.removeAttribute("data-sequence-participant-id");
      text.removeAttribute("data-sequence-message-id");
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
          addDragHitTarget(
            text,
            "data-sequence-message-id",
            message.id,
            `Drag message ${message.label}`,
            18,
            11,
            true,
          );
        }
      }
    }
    addMessageReconnectAnchors(root, participants, messages, selectedMessageId);
    restoreActiveReconnectPreview(root);
    const frame = window.requestAnimationFrame(() => {
      root
        .querySelectorAll(
          ".sequence-selected-message-line, .sequence-selected-message-head, .sequence-participant-anchor, .sequence-message-endpoint",
        )
        .forEach((element) => element.remove());
      addMessageReconnectAnchors(root, participants, messages, selectedMessageId);
      restoreActiveReconnectPreview(root);
    });
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
      const preview = createReconnectPreview(
        currentRoot,
        handle,
        drag.endpoint,
        drag.id,
        participants,
        messages,
      );
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
    const text = (event.target as Element).closest("text")?.textContent?.trim();
    if (!text) return;
    const participant = participants.find((item) => text === item.label || text === (item.alias ?? item.label));
    if (participant) {
      onParticipantSelect(participant.id);
      return;
    }
    const message = messages.find((item) => item.label && (text === item.label || text.endsWith(item.label)));
    if (message) onMessageSelect(message.id);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    const endpointHandle = target.closest("[data-sequence-message-endpoint]");
    const endpoint = endpointHandle?.getAttribute("data-sequence-message-endpoint") as "from" | "to" | null;
    const endpointMessageId = endpointHandle?.getAttribute("data-sequence-message-id");
    const participantId = target
      .closest("[data-sequence-participant-id]")
      ?.getAttribute("data-sequence-participant-id");
    const messageId = target.closest("[data-sequence-message-id]")?.getAttribute("data-sequence-message-id");
    if (!participantId && !messageId && !endpointMessageId) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    const element = endpointHandle ?? target.closest("text") ?? target;
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
    const movePreview = !endpointMessageId && messageId
      ? createMessageMovePreview(diagramRef.current, messageId, participants, messages)
      : undefined;
    dragRef.current = {
      kind: endpointMessageId ? "message-endpoint" : participantId ? "participant" : "message",
      id: endpointMessageId ?? participantId ?? messageId!,
      ...(endpoint ? { endpoint } : {}),
      x: event.clientX,
      y: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      create: Boolean(participantId && event.shiftKey),
      element,
      label: endpoint
        ? `${endpoint === "from" ? "Sender" : "Receiver"} endpoint`
        : element.textContent?.trim() || (participantId ? "Participant" : "Message"),
      ...(reconnectPreview ? { reconnectPreview } : {}),
      ...(movePreview ? { movePreview } : {}),
    };
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
    if (drag.reconnectPreview) updateReconnectPreview(drag.reconnectPreview, event.clientX, event.clientY);
    if (drag.movePreview) updateMessageMovePreview(drag.movePreview, event.clientX, event.clientY);
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
        : Math.abs(dx) > Math.abs(dy)
          ? "Drop on a participant to reconnect this endpoint"
          : "Drop on a message to reorder";
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
      else onMessageSelect(drag.id);
      return;
    }
    const previousPointerEvents = (drag.element as SVGElement).style.pointerEvents;
    (drag.element as SVGElement).style.pointerEvents = "none";
    const drop = document.elementFromPoint(event.clientX, event.clientY);
    (drag.element as SVGElement).style.pointerEvents = previousPointerEvents;
    let participantId = drop?.closest("[data-sequence-participant-id]")?.getAttribute("data-sequence-participant-id");
    if (
      (!participantId || participantId === drag.id) &&
      (drag.kind === "participant" || drag.kind === "message-endpoint" || Math.abs(dx) > Math.abs(dy))
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
    let messageId = drop?.closest("[data-sequence-message-id]")?.getAttribute("data-sequence-message-id");
    if (drag.kind === "message" && Math.abs(dy) >= Math.abs(dx) && (!messageId || messageId === drag.id)) {
      const nearest = [
        ...(diagramRef.current?.querySelectorAll<SVGGraphicsElement>("[data-sequence-message-id]") ?? []),
      ]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-sequence-message-id"),
            distance: Math.abs(rect.top + rect.height / 2 - event.clientY),
          };
        })
        .filter((item) => item.id !== drag.id)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest?.id && nearest.distance < 60) messageId = nearest.id;
    }
    if (drag.kind === "participant") {
      if (!participantId || participantId === drag.id) return;
      suppressClickRef.current = true;
      if (drag.create || event.shiftKey) onMessageCreate(drag.id, participantId);
      else {
        const target = diagramRef.current?.querySelector<SVGGraphicsElement>(
          `[data-sequence-drag-hit][data-sequence-participant-id="${CSS.escape(participantId)}"]`,
        );
        const placement = target && event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2 ? "after" : "before";
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
    if (messageId && messageId !== drag.id) {
      suppressClickRef.current = true;
      const target = diagramRef.current?.querySelector<SVGGraphicsElement>(
        `[data-sequence-drag-hit][data-sequence-message-id="${CSS.escape(messageId)}"]`,
      );
      const placement = target && event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? "after" : "before";
      onMessageReorder(drag.id, messageId, placement);
    } else if (participantId) {
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
        <button onClick={() => onZoomChange(1)} aria-label="Reset zoom">
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
        {(selectedParticipant || selectedMessage) && (
          <span className="sequence-selection-label">
            {selectedParticipant
              ? `Participant: ${selectedParticipant.label}`
              : `Message: ${selectedMessage!.label || "(unlabelled)"}`}
          </span>
        )}
        <span className="sequence-drag-hint">Drag participants sideways · messages vertically</span>
        {selectedMessage && <span className="sequence-edge-actions"><button onClick={() => onMessageExternalize(selectedMessage.id, "from", "[")}>From edge</button><button onClick={() => onMessageExternalize(selectedMessage.id, "to", "]")}>To edge</button><button onClick={() => onMessageExternalize(selectedMessage.id, "to", "?")}>Mark lost</button></span>}
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
        </aside>
      )}
      <div className={`preview-viewport${renderStatus !== "idle" && svg ? " stale-preview" : ""}`}>
        {svg ? (
          <div
            className="diagram sequence-diagram"
            ref={diagramRef}
            style={{ transform: `scale(${zoom})` }}
            onClick={selectRenderedObject}
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
      selectedHead.setAttribute(
        "points",
        `${toOwner.x},${y} ${back},${y - 6} ${back},${y + 6}`,
      );
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
    ? root?.querySelector<SVGTextElement>(
        `text[data-sequence-participant-id="${CSS.escape(fixedParticipant.id)}"]`,
      )
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
  const messageText = root?.querySelector<SVGTextElement>(
    `text[data-sequence-message-id="${CSS.escape(messageId)}"]`,
  );
  const svg = messageText?.ownerSVGElement;
  if (!message || !messageText || !svg) return undefined;
  const viewBox = svg.viewBox.baseVal;
  const participantX = (reference: string, edge: "from" | "to") => {
    const participant = participants.find((item) => (item.alias ?? item.label) === reference);
    const text = participant
      ? root?.querySelector<SVGTextElement>(
          `text[data-sequence-participant-id="${CSS.escape(participant.id)}"]`,
        )
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
  kind: "participant" | "message";
  items: readonly { id: string; label: string }[];
  dragged?: { kind: "participant" | "message"; id: string } | undefined;
  onDrag(value: { kind: "participant" | "message"; id: string } | undefined): void;
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
            onDragEnd={() => { onDrag(undefined); setDropTarget(undefined); }}
            onDragOver={(event) => {
              if (dragged?.kind === kind && dragged.id !== item.id) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({ id: item.id, placement: event.clientY > bounds.top + bounds.height / 2 ? "after" : "before" });
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
            <span className="sequence-order-grip" aria-hidden="true">⠿</span>
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
  attribute: "data-sequence-participant-id" | "data-sequence-message-id",
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
    const transform = text.getAttribute("transform");
    if (transform) rect.setAttribute("transform", transform);
    // Appending makes the transparent target the topmost SVG hit surface while leaving the diagram visible.
    (svg ?? text.parentElement)?.appendChild(rect);
  } catch {
    // Some SVG implementations cannot measure text until after first paint; the text itself remains draggable.
  }
}
