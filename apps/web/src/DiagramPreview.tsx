import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { GanttDependency, GanttDivider, GanttTask } from "@plantuml-studio/diagram-gantt";
import { addCanonicalGanttOverlay } from "./render/canonical-gantt-overlay";
import { calendarResizeTarget, parseGanttCalendar } from "./gantt-calendar";
import { resolveTaskDates, taskElapsedDays, type ResolvedTaskDates } from "./gantt-schedule";
import type { RenderStatus } from "./model";
import type { ResourceOverAllocation } from "./ResourceWorkloadPanel";

interface Props {
  svg: string | undefined;
  tasks: readonly GanttTask[];
  dependencies: readonly GanttDependency[];
  dividers: readonly GanttDivider[];
  source: string;
  zoom: number;
  onZoomChange(zoom: number): void;
  selectedTaskId?: string | undefined;
  onTaskSelect(taskId: string): void;
  onTaskMove(taskId: string, days: number): void;
  onTaskReorder(taskId: string, beforeTaskId?: string): void;
  onDividerReorder(dividerIndex: number, beforeTaskId?: string): void;
  onTaskResize(taskId: string, durationDays: number, calendarDays: number): void;
  onDependencyCreate(predecessorTaskId: string, successorTaskId: string): void;
  selectedDependencyIndex?: number | undefined;
  onDependencySelect(index: number | undefined): void;
  onDependencyDelete(): void;
  onInteractionMessage(message: string | undefined): void;
  resourceFilter: string;
  scheduleGhost?: { taskIds: readonly string[]; days: number } | undefined;
  projectStart?: string | undefined;
  renderStatus: RenderStatus;
  renderError?: string | undefined;
  onRenderRetry(): void;
  parseDurationMs: number;
  openDocumentCount: number;
  openSourceBytes: number;
  resourceOverAllocations: readonly ResourceOverAllocation[];
  onOpenResourceWorkload(): void;
}

export function DiagramPreview({
  svg,
  tasks,
  dependencies,
  dividers,
  source,
  zoom,
  onZoomChange,
  selectedTaskId,
  onTaskSelect,
  onTaskMove,
  onTaskReorder,
  onDividerReorder,
  onTaskResize,
  onDependencyCreate,
  selectedDependencyIndex,
  onDependencySelect,
  onDependencyDelete,
  onInteractionMessage,
  resourceFilter,
  scheduleGhost,
  projectStart,
  renderStatus,
  renderError,
  onRenderRetry,
  parseDurationMs,
  openDocumentCount,
  openSourceBytes,
  resourceOverAllocations,
  onOpenResourceWorkload,
}: Props) {
  const previewRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLOutputElement>(null);
  const pointerTaskIdRef = useRef<string | undefined>(undefined);
  const draggingRef = useRef(false);
  const [connection, setConnection] = useState<{ x1: number; y1: number; x2: number; y2: number }>();
  const [hoveredTask, setHoveredTask] = useState<{ id: string; x: number; y: number }>();
  const [scrollPercent, setScrollPercent] = useState(0);
  const overlayResult = useMemo(() => {
    const started = performance.now();
    const value = svg
      ? addCanonicalGanttOverlay(svg, tasks, dependencies, dividers, resourceFilter, scheduleGhost)
      : svg;
    return { value, durationMs: performance.now() - started };
  }, [svg, tasks, dependencies, dividers, resourceFilter, scheduleGhost]);
  const interactiveSvg = overlayResult.value;
  const calendar = useMemo(() => parseGanttCalendar(source), [source]);
  const resolvedDates = useMemo(
    () => resolveTaskDates(tasks, dependencies, projectStart, calendar),
    [tasks, dependencies, projectStart, calendar],
  );
  const showFeedback = (message?: string) => {
    if (!feedbackRef.current) return;
    feedbackRef.current.textContent = message ?? "";
    feedbackRef.current.hidden = !message;
  };
  const selectedSvg = useMemo(() => {
    if (!interactiveSvg) return interactiveSvg;
    let marked = interactiveSvg;
    if (selectedTaskId) {
      const escapedId = selectedTaskId
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      const marker = `data-task-id="${escapedId}"`;
      marked = marked.replace(marker, `${marker} data-selected="true"`);
    }
    if (selectedDependencyIndex !== undefined) {
      const marker = `data-dependency-index="${selectedDependencyIndex}"`;
      marked = marked.replace(marker, `${marker} data-selected="true"`);
    }
    return marked;
  }, [interactiveSvg, selectedTaskId, selectedDependencyIndex]);
  const hoverDetails = hoveredTask
    ? taskHoverDetails(
        tasks.find((item) => item.id === hoveredTask.id),
        dependencies,
        tasks,
        resolvedDates.get(hoveredTask.id),
      )
    : undefined;

  const revealTask = (taskId: string | undefined) => {
    if (!taskId) return;
    const viewport = viewportRef.current;
    const visual = [...(previewRef.current?.querySelectorAll<SVGGraphicsElement>("[data-visual-task-id]") ?? [])].find(
      (item) => item.getAttribute("data-visual-task-id") === taskId,
    );
    if (!viewport || !visual) return;
    const viewportRect = viewport.getBoundingClientRect();
    const rect = visual.getBoundingClientRect();
    const horizontal =
      rect.width <= viewportRect.width - 48
        ? rect.left + rect.width / 2 - (viewportRect.left + viewportRect.width / 2)
        : rect.right - (viewportRect.right - 24);
    viewport.scrollBy({
      left: horizontal,
      top: rect.top + rect.height / 2 - (viewportRect.top + viewportRect.height / 2),
      behavior: "auto",
    });
  };
  const jumpToday = () => {
    const viewport = viewportRef.current;
    const svg = previewRef.current?.querySelector<SVGSVGElement>(".diagram svg");
    if (!viewport || !svg) return;
    const reference = tasks.find((task) => resolvedDates.get(task.id)?.start);
    const group = reference
      ? [...svg.querySelectorAll<SVGGElement>("[data-task-id]")].find(
          (item) => item.getAttribute("data-task-id") === reference.id,
        )
      : undefined;
    const bar = group?.querySelector<SVGRectElement>(".bar");
    const start = reference ? resolvedDates.get(reference.id)?.start : undefined;
    if (!bar || !start) {
      onInteractionMessage("No resolved task date is available to locate today");
      return;
    }
    const dayWidth = Number(group?.getAttribute("data-day-width") ?? 16);
    const delta = Math.round((Date.now() - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
    const scale = svgScreenScale(svg);
    const svgRect = svg.getBoundingClientRect();
    const x =
      svgRect.left - viewport.getBoundingClientRect().left + (Number(bar.getAttribute("x")) + delta * dayWidth) * scale;
    viewport.scrollBy({ left: x - viewport.clientWidth / 2, behavior: "smooth" });
    onInteractionMessage("Centered the timeline on today");
  };
  const adjacentTask = (direction: -1 | 1) => {
    const index = tasks.findIndex((item) => item.id === selectedTaskId);
    const next = tasks[Math.min(tasks.length - 1, Math.max(0, (index < 0 ? 0 : index) + direction))];
    if (next) {
      onTaskSelect(next.id);
      window.setTimeout(() => revealTask(next.id), 0);
    }
  };
  useEffect(() => {
    if (selectedTaskId) window.setTimeout(() => revealTask(selectedTaskId), 0);
  }, [selectedTaskId, selectedSvg, zoom]);
  useEffect(() => {
    if (selectedTaskId) setHoveredTask(undefined);
  }, [selectedTaskId]);

  const selectFromEvent = (event: React.SyntheticEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    const dependency = target.closest("[data-dependency-index]");
    if (dependency) {
      const index = Number(dependency.getAttribute("data-dependency-index"));
      if (Number.isInteger(index)) onDependencySelect(index);
      return;
    }
    const task = target.closest<SVGGElement>("[data-task-id]");
    const id = task?.getAttribute("data-task-id") ?? pointerTaskIdRef.current;
    pointerTaskIdRef.current = undefined;
    if (id) {
      onDependencySelect(undefined);
      onTaskSelect(id);
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    const divider = target.closest<SVGGElement>("[data-divider-index]");
    if (divider) {
      const index = Number(divider.getAttribute("data-divider-index"));
      if (!Number.isInteger(index)) return;
      event.preventDefault();
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const scale = svgScreenScale(divider.ownerSVGElement);
      const visuals = [
        ...(divider.ownerSVGElement?.querySelectorAll<SVGGraphicsElement>(`[data-visual-divider-index="${index}"]`) ??
          []),
      ];
      const originalTransforms = [divider, ...visuals].map((item) => item.getAttribute("transform"));
      let targetId: string | undefined;
      let moved = false;
      const moveDivider = (moveEvent: PointerEvent) => {
        const deltaY = moveEvent.clientY - startY;
        if (Math.abs(deltaY) > 5) moved = true;
        [divider, ...visuals].forEach((item) => item.setAttribute("transform", `translate(0 ${deltaY / scale})`));
        targetId = dividerTargetAtY(divider.ownerSVGElement, moveEvent.clientY);
        highlightReorderTarget(divider.ownerSVGElement, targetId);
        const task = tasks.find((item) => item.id === targetId);
        showFeedback(task ? `Place divider before ${task.label}` : "Move below all tasks");
      };
      const endDivider = () => {
        window.removeEventListener("pointermove", moveDivider);
        window.removeEventListener("pointerup", endDivider, true);
        [divider, ...visuals].forEach((item, itemIndex) => {
          const original = originalTransforms[itemIndex];
          if (original === null || original === undefined) item.removeAttribute("transform");
          else item.setAttribute("transform", original);
        });
        highlightReorderTarget(divider.ownerSVGElement, undefined);
        showFeedback();
        draggingRef.current = false;
        setHoveredTask(undefined);
        if (moved) onDividerReorder(index, targetId);
      };
      window.addEventListener("pointermove", moveDivider);
      window.addEventListener("pointerup", endDivider, true);
      return;
    }
    const task = target.closest<SVGGElement>("[data-task-id]");
    const id = task?.getAttribute("data-task-id");
    pointerTaskIdRef.current = id ?? undefined;
    if (!task || !id) return;
    const dependencyHandle = target.closest("[data-dependency-handle]");
    if (dependencyHandle) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const previewRect = previewRef.current?.getBoundingClientRect();
      const handleRect = dependencyHandle.getBoundingClientRect();
      if (!previewRect) return;
      const x1 = handleRect.left + handleRect.width / 2 - previewRect.left;
      const y1 = handleRect.top + handleRect.height / 2 - previewRect.top;
      setConnection({ x1, y1, x2: x1, y2: y1 });
      onInteractionMessage(`Connect ${id} to a successor task`);
      let highlightedTargetId: string | undefined;
      const moveConnection = (moveEvent: PointerEvent) => {
        const liveSvg = previewRef.current?.querySelector<SVGSVGElement>(".diagram svg") ?? null;
        const candidateId = taskIdAtPoint(liveSvg, moveEvent.clientX, moveEvent.clientY);
        const nextTargetId = candidateId && candidateId !== id ? candidateId : undefined;
        if (nextTargetId !== highlightedTargetId) {
          highlightConnectionTarget(liveSvg, nextTargetId);
          highlightedTargetId = nextTargetId;
        }
        const targetGroup = nextTargetId
          ? [...(liveSvg?.querySelectorAll<SVGGElement>("[data-task-id]") ?? [])].find(
              (group) => group.getAttribute("data-task-id") === nextTargetId,
            )
          : undefined;
        const targetHandleRect = targetGroup?.querySelector("[data-dependency-target-handle]")?.getBoundingClientRect();
        setConnection({
          x1,
          y1,
          x2: targetHandleRect
            ? targetHandleRect.left + targetHandleRect.width / 2 - previewRect.left
            : moveEvent.clientX - previewRect.left,
          y2: targetHandleRect
            ? targetHandleRect.top + targetHandleRect.height / 2 - previewRect.top
            : moveEvent.clientY - previewRect.top,
        });
      };
      const endConnection = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", moveConnection);
        window.removeEventListener("pointerup", endConnection);
        setConnection(undefined);
        const liveSvg = previewRef.current?.querySelector<SVGSVGElement>(".diagram svg") ?? null;
        const successorId = taskIdAtPoint(liveSvg, upEvent.clientX, upEvent.clientY);
        highlightConnectionTarget(liveSvg, undefined);
        if (successorId && successorId !== id) {
          onInteractionMessage(undefined);
          onDependencyCreate(id, successorId);
        } else
          onInteractionMessage(
            successorId === id ? "A task cannot depend on itself" : "Drop the connection on another task bar or label",
          );
      };
      window.addEventListener("pointermove", moveConnection);
      window.addEventListener("pointerup", endConnection);
      return;
    }
    const resizeHandle = target.closest("[data-resize-handle]");
    if (resizeHandle) {
      event.preventDefault();
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      const bar = task.querySelector<SVGRectElement>(".bar");
      const visualBar = visualTaskElements(task.ownerSVGElement, id).find(
        (item): item is SVGRectElement => item instanceof SVGRectElement,
      );
      const dayWidth = Number(task.getAttribute("data-day-width") ?? 16);
      const pixelsPerSvgUnit = svgScreenScale(task.ownerSVGElement);
      const originalWidth = Number(bar?.getAttribute("width") ?? dayWidth);
      const originalVisualWidth = visualBar?.getAttribute("width");
      const previewBar = createTaskGhost(task, visualBar ?? bar);
      const startX = event.clientX;
      const initialScrollLeft = viewportRef.current?.scrollLeft ?? 0;
      let snappedDays = 0;
      let durationDelta = 0;
      let lastDisplayedDays: number | undefined;
      const moveResize = (moveEvent: PointerEvent) => {
        const rawDays = (moveEvent.clientX - startX) / (dayWidth * pixelsPerSvgUnit);
        const durationUnit = task.getAttribute("data-duration-unit");
        const step = moveEvent.shiftKey ? 7 : durationUnit === "month" ? 30 : durationUnit === "week" ? 7 : 1;
        snappedDays = Math.round(rawDays / step) * step;
        const modelTask = tasks.find((item) => item.id === id);
        const calendarTarget = modelTask ? calendarResizeTarget(modelTask, snappedDays, calendar) : undefined;
        if (calendarTarget) {
          snappedDays = calendarTarget.calendarDays;
          durationDelta = calendarTarget.durationDelta;
        } else durationDelta = snappedDays;
        if (snappedDays === lastDisplayedDays) return;
        lastDisplayedDays = snappedDays;
        const width = Math.max(dayWidth, originalWidth + snappedDays * dayWidth);
        bar?.setAttribute("width", String(width));
        visualBar?.setAttribute("width", String(width));
        previewBar?.setAttribute("width", String(width));
        if (viewportRef.current)
          viewportRef.current.scrollLeft = Math.max(0, initialScrollLeft + Math.max(0, moveEvent.clientX - startX));
        resizeHandle.setAttribute("x", String(Number(bar?.getAttribute("x") ?? 0) + width - 5));
        previewDependencyPaths(task.ownerSVGElement, id, 0, snappedDays * dayWidth);
        showFeedback(
          calendarTarget
            ? `Ends ${calendarTarget.endDate} · ${(modelTask?.duration?.value ?? 0) + durationDelta} days (${durationDelta > 0 ? "+" : ""}${durationDelta})`
            : resizeTaskFeedback(modelTask, durationDelta),
        );
      };
      const endResize = () => {
        window.removeEventListener("pointermove", moveResize);
        window.removeEventListener("pointerup", endResize);
        window.removeEventListener("pointercancel", endResize);
        bar?.setAttribute("width", String(originalWidth));
        if (visualBar && originalVisualWidth !== null && originalVisualWidth !== undefined)
          visualBar.setAttribute("width", originalVisualWidth);
        resizeHandle.setAttribute("x", String(Number(bar?.getAttribute("x") ?? 0) + originalWidth - 5));
        resetDependencyPaths(task.ownerSVGElement);
        previewBar?.remove();
        showFeedback();
        draggingRef.current = false;
        setHoveredTask(undefined);
        onTaskSelect(id);
        if (durationDelta !== 0) onTaskResize(id, durationDelta, snappedDays);
      };
      window.addEventListener("pointermove", moveResize);
      window.addEventListener("pointerup", endResize);
      window.addEventListener("pointercancel", endResize);
      return;
    }
    const canMoveDates = task.getAttribute("data-draggable") === "true";
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const interactionHost = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const dayWidth = Number(task.getAttribute("data-day-width") ?? 16);
    const pixelsPerSvgUnit = svgScreenScale(task.ownerSVGElement);
    const visualElements = visualTaskElements(task.ownerSVGElement, id);
    const previewBar = createTaskGhost(
      task,
      visualElements.find((element): element is SVGRectElement => element instanceof SVGRectElement) ??
        task.querySelector<SVGRectElement>(".bar"),
    );
    const originalTransforms = visualElements.map((element) => element.getAttribute("transform"));
    const originalTaskTransform = task.getAttribute("transform");
    let snappedDays = 0;
    let lastDisplayedDays: number | undefined;
    let dragMode: "pending" | "horizontal" | "vertical" = "pending";
    let reorderTargetId: string | undefined;
    let ended = false;
    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (dragMode === "pending" && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6)
        dragMode = Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";
      if (dragMode === "vertical") {
        snappedDays = 0;
        task.setAttribute("transform", `translate(0 ${deltaY / pixelsPerSvgUnit})`);
        visualElements.forEach((element) =>
          element.setAttribute("transform", `translate(0 ${deltaY / pixelsPerSvgUnit})`),
        );
        previewBar?.setAttribute("transform", `translate(0 ${deltaY / pixelsPerSvgUnit})`);
        reorderTargetId = taskIdAtY(task.ownerSVGElement, moveEvent.clientY, id);
        highlightReorderTarget(task.ownerSVGElement, reorderTargetId);
        const target = tasks.find((item) => item.id === reorderTargetId);
        showFeedback(
          target
            ? `Place ${tasks.find((item) => item.id === id)?.label ?? id} before ${target.label}`
            : "Move to another task row",
        );
        return;
      }
      if (!canMoveDates) {
        snappedDays = 0;
        showFeedback("This task has no date or dependency that can be moved.");
        return;
      }
      const rawDays = deltaX / (dayWidth * pixelsPerSvgUnit);
      const step = moveEvent.shiftKey ? 7 : 1;
      snappedDays = Math.round(rawDays / step) * step;
      if (snappedDays === lastDisplayedDays) return;
      lastDisplayedDays = snappedDays;
      task.setAttribute("transform", `translate(${snappedDays * dayWidth} 0)`);
      visualElements.forEach((element) => element.setAttribute("transform", `translate(${snappedDays * dayWidth} 0)`));
      previewBar?.setAttribute("transform", `translate(${snappedDays * dayWidth} 0)`);
      previewDependencyPaths(task.ownerSVGElement, id, snappedDays * dayWidth, 0);
      showFeedback(
        snappedDays
          ? `Move ${snappedDays > 0 ? "+" : ""}${snappedDays} day${Math.abs(snappedDays) === 1 ? "" : "s"}`
          : undefined,
      );
    };
    const end = () => {
      if (ended) return;
      ended = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("mouseup", end, true);
      interactionHost.removeEventListener("pointerup", end);
      interactionHost.removeEventListener("pointercancel", end);
      interactionHost.removeEventListener("lostpointercapture", end);
      if (originalTaskTransform === null) task.removeAttribute("transform");
      else task.setAttribute("transform", originalTaskTransform);
      visualElements.forEach((element, index) => {
        const original = originalTransforms[index];
        if (original === null || original === undefined) element.removeAttribute("transform");
        else element.setAttribute("transform", original);
      });
      resetDependencyPaths(task.ownerSVGElement);
      previewBar?.remove();
      highlightReorderTarget(task.ownerSVGElement, undefined);
      showFeedback();
      draggingRef.current = false;
      setHoveredTask(undefined);
      onTaskSelect(id);
      if (dragMode === "vertical" && reorderTargetId) onTaskReorder(id, reorderTargetId);
      else if (snappedDays !== 0) onTaskMove(id, snappedDays);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("mouseup", end, true);
    interactionHost.addEventListener("pointerup", end);
    interactionHost.addEventListener("pointercancel", end);
    interactionHost.addEventListener("lostpointercapture", end);
  };

  return (
    <section className="preview" ref={previewRef} aria-label="Diagram preview">
      <div className="preview-tools">
        <button onClick={() => adjacentTask(-1)} aria-label="Previous task">
          ↑
        </button>
        <button onClick={() => adjacentTask(1)} aria-label="Next task">
          ↓
        </button>
        <button
          onClick={() => revealTask(selectedTaskId)}
          disabled={!selectedTaskId}
          aria-label="Jump to selected task"
        >
          Selected
        </button>
        <button onClick={jumpToday} aria-label="Jump to today">
          Today
        </button>
        <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.1))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => onZoomChange(1)} aria-label="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => onZoomChange(Math.min(3, zoom + 0.1))} aria-label="Zoom in">
          +
        </button>
        <select
          aria-label="Timeline zoom preset"
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value === "fit") {
              onZoomChange(1);
              viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
            } else onZoomChange(value === "day" ? 2 : value === "week" ? 1.35 : 0.8);
          }}
        >
          <option value="" disabled>
            View
          </option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="fit">Fit project</option>
        </select>
        {selectedDependencyIndex !== undefined && (
          <button onClick={onDependencyDelete} aria-label="Delete dependency">
            Delete link
          </button>
        )}
      </div>
      <div
        className={`preview-viewport${renderStatus !== "idle" && selectedSvg ? " stale-preview" : ""}`}
        ref={viewportRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          setScrollPercent(
            element.scrollWidth <= element.clientWidth
              ? 0
              : (element.scrollLeft / (element.scrollWidth - element.clientWidth)) * 100,
          );
        }}
      >
        {selectedSvg ? (
          <div
            className="diagram"
            data-selected-task={selectedTaskId}
            style={{ transform: `scale(${zoom})` }}
            onClick={selectFromEvent}
            onPointerDown={startDrag}
            onPointerUp={() => {
              const id = pointerTaskIdRef.current;
              pointerTaskIdRef.current = undefined;
              if (id) {
                onDependencySelect(undefined);
                onTaskSelect(id);
              }
            }}
            onPointerOver={(event) => {
              if (draggingRef.current) return;
              const group = (event.target as Element).closest<SVGGElement>("[data-task-id]");
              const id = group?.getAttribute("data-task-id");
              const preview = previewRef.current?.getBoundingClientRect();
              if (id && id !== selectedTaskId && preview) {
                const rect = group!.getBoundingClientRect();
                setHoveredTask({
                  id,
                  x: Math.min(preview.width - 270, Math.max(8, rect.right - preview.left + 8)),
                  y: Math.max(8, rect.top - preview.top),
                });
              }
            }}
            onPointerOut={(event) => {
              if (draggingRef.current) return;
              const from = (event.target as Element).closest("[data-task-id]");
              const to = (event.relatedTarget as Element | null)?.closest?.("[data-task-id]");
              if (from && from !== to) setHoveredTask(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                selectFromEvent(event);
                return;
              }
              const currentId = (event.target as Element).closest("[data-task-id]")?.getAttribute("data-task-id");
              const currentIndex = tasks.findIndex((item) => item.id === currentId);
              if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight") && currentId) {
                event.preventDefault();
                const days = event.key === "ArrowRight" ? 1 : -1;
                if (event.shiftKey) onTaskResize(currentId, days, days);
                else onTaskMove(currentId, days);
                return;
              }
              if (
                event.ctrlKey &&
                (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                currentId &&
                currentIndex >= 0
              ) {
                event.preventDefault();
                if (event.key === "ArrowUp" && currentIndex > 0) onTaskReorder(currentId, tasks[currentIndex - 1]!.id);
                else if (event.key === "ArrowDown" && currentIndex < tasks.length - 1)
                  onTaskReorder(currentId, tasks[currentIndex + 2]?.id);
                else onInteractionMessage("The task is already at the edge of the diagram");
                return;
              }
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              const index = currentIndex;
              if (index < 0) return;
              const next = tasks[Math.min(tasks.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
              if (next) {
                event.preventDefault();
                event.currentTarget.querySelector<SVGGElement>(`[data-task-id="${CSS.escape(next.id)}"]`)?.focus();
              }
            }}
          >
            <MemoizedSvgMarkup svg={selectedSvg} />
          </div>
        ) : (
          <div className="diagram" style={{ transform: `scale(${zoom})` }}>
            <span>Rendering preview…</span>
          </div>
        )}
      </div>
      {renderStatus === "rendering" && (
        <div className="render-notice rendering" role="status" aria-live="polite">
          <strong>Rendering updated preview…</strong>
          <span>The previous diagram is dimmed until this source finishes.</span>
        </div>
      )}
      {renderStatus === "error" && (
        <div className="render-notice error" role="alert">
          <strong>Preview could not be updated</strong>
          <span>{renderError ?? "The renderer returned an unknown error."}</span>
          <button type="button" onClick={onRenderRetry}>
            Retry rendering
          </button>
        </div>
      )}
      {resourceOverAllocations.length > 0 && (
        <aside className="resource-overallocation-alert" role="alert" aria-label="Resource over-allocation">
          <div>
            <strong>Resource over-allocation</strong>
            <span>
              {resourceOverAllocations.map((resource) => (
                <span key={resource.name}>
                  {resource.name}: {resource.peak}% assigned / {resource.capacity}% capacity across {resource.days} day
                  {resource.days === 1 ? "" : "s"} ({resource.tasks.map((task) => task.label).join(", ")})
                </span>
              ))}
            </span>
          </div>
          <button type="button" onClick={onOpenResourceWorkload}>
            Review workload
          </button>
        </aside>
      )}
      {import.meta.env.DEV && (
        <output className="performance-badge" aria-label="Development performance metrics">
          Parse {parseDurationMs.toFixed(1)} ms · Overlay {overlayResult.durationMs.toFixed(1)} ms · {tasks.length}{" "}
          tasks · {openDocumentCount} tab{openDocumentCount === 1 ? "" : "s"} · {(openSourceBytes / 1024).toFixed(0)} KB
          source
        </output>
      )}
      <div className="timeline-minimap">
        <span>Timeline</span>
        <input
          aria-label="Timeline position"
          type="range"
          min="0"
          max="100"
          value={scrollPercent}
          onChange={(event) => {
            const viewport = viewportRef.current;
            if (viewport)
              viewport.scrollLeft =
                (Number(event.target.value) / 100) * Math.max(0, viewport.scrollWidth - viewport.clientWidth);
          }}
        />
      </div>
      {connection && (
        <svg className="connection-overlay" aria-hidden="true">
          <line x1={connection.x1} y1={connection.y1} x2={connection.x2} y2={connection.y2} />
        </svg>
      )}
      {hoveredTask && hoverDetails && (
        <aside
          className="task-hover-card"
          style={{ left: hoveredTask.x, top: hoveredTask.y }}
          onPointerEnter={() => setHoveredTask(hoveredTask)}
          onPointerLeave={() => setHoveredTask(undefined)}
          aria-label={`Task details for ${hoverDetails.label}`}
        >
          <strong>{hoverDetails.label}</strong>
          <dl>
            <div>
              <dt>Dates</dt>
              <dd>{hoverDetails.dates}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{hoverDetails.duration}</dd>
            </div>
            <div>
              <dt>Complete</dt>
              <dd>{hoverDetails.completion}</dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{hoverDetails.resources}</dd>
            </div>
          </dl>
          {hoverDetails.predecessors.length > 0 && (
            <div className="hover-links">
              <span>From</span>
              {hoverDetails.predecessors.map((item) => (
                <button key={item.id} onClick={() => onTaskSelect(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {hoverDetails.successors.length > 0 && (
            <div className="hover-links">
              <span>To</span>
              {hoverDetails.successors.map((item) => (
                <button key={item.id} onClick={() => onTaskSelect(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
      <output ref={feedbackRef} className="interaction-feedback" hidden aria-live="off" />
    </section>
  );
}

const MemoizedSvgMarkup = memo(function SvgMarkup({ svg }: { svg: string }) {
  return <div className="diagram-svg-host" dangerouslySetInnerHTML={{ __html: svg }} />;
});

export function taskHoverDetails(
  task: GanttTask | undefined,
  dependencies: readonly GanttDependency[],
  tasks: readonly GanttTask[],
  resolved?: ResolvedTaskDates,
) {
  if (!task) return undefined;
  const durationDays = taskElapsedDays(task);
  const end =
    resolved?.end ??
    task.end?.value ??
    (task.start?.resolved && durationDays ? addIsoDays(task.start.value, durationDays - 1) : undefined);
  const start =
    resolved?.start ??
    task.start?.value ??
    (dependencies.some((item) => item.successorTaskId === task.id) ? "Relative" : "Automatic");
  const linked = (ids: string[]) =>
    ids
      .map((id) => tasks.find((item) => item.id === id))
      .filter((item): item is GanttTask => Boolean(item))
      .map((item) => ({ id: item.id, label: item.label }));
  return {
    label: task.label,
    dates: `${start} → ${end ?? "Automatic"}`,
    duration: task.duration
      ? `${task.duration.value} ${task.duration.unit}${task.duration.value === 1 ? "" : "s"}`
      : "Automatic",
    completion: task.completion ? `${task.completion.value}%` : "Not set",
    resources: (task.resources ?? []).map((item) => `${item.value} ${item.allocation ?? 100}%`).join(", ") || "None",
    predecessors: linked(
      dependencies.filter((item) => item.successorTaskId === task.id).map((item) => item.predecessorTaskId),
    ),
    successors: linked(
      dependencies.filter((item) => item.predecessorTaskId === task.id).map((item) => item.successorTaskId),
    ),
  };
}

function taskIdAtY(svg: SVGSVGElement | null, clientY: number, excludeId: string): string | undefined {
  if (!svg) return undefined;
  let nearest: { id: string; distance: number } | undefined;
  for (const group of svg.querySelectorAll<SVGGElement>("[data-task-id]")) {
    const id = group.getAttribute("data-task-id");
    if (!id || id === excludeId) continue;
    const rect = group.querySelector<SVGGraphicsElement>(".bar")?.getBoundingClientRect();
    if (!rect) continue;
    const distance = Math.abs(clientY - (rect.top + rect.height / 2));
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest?.id;
}

function dividerTargetAtY(svg: SVGSVGElement | null, clientY: number): string | undefined {
  if (!svg) return undefined;
  const rows = [...svg.querySelectorAll<SVGGElement>("[data-task-id]")].flatMap((group) => {
    const rect = group.querySelector<SVGGraphicsElement>(".bar")?.getBoundingClientRect();
    const id = group.getAttribute("data-task-id");
    return rect && id ? [{ id, top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2 }] : [];
  });
  if (!rows.length || clientY > Math.max(...rows.map((row) => row.bottom)) + 8) return undefined;
  return rows.sort((a, b) => Math.abs(clientY - a.center) - Math.abs(clientY - b.center))[0]?.id;
}

function highlightReorderTarget(svg: SVGSVGElement | null, taskId: string | undefined): void {
  if (!svg) return;
  for (const group of svg.querySelectorAll<SVGGElement>("[data-task-id]"))
    group.classList.toggle("reorder-target", group.getAttribute("data-task-id") === taskId);
}

function visualTaskElements(svg: SVGSVGElement | null, taskId: string): SVGGraphicsElement[] {
  if (!svg) return [];
  return [...svg.querySelectorAll<SVGGraphicsElement>("[data-visual-task-id]")].filter(
    (element) => element.getAttribute("data-visual-task-id") === taskId,
  );
}

function createTaskGhost(task: SVGGElement, source: SVGRectElement | null | undefined): SVGRectElement | undefined {
  const svg = task.ownerSVGElement;
  if (!svg || !source) return undefined;
  const ghost = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  for (const attribute of ["x", "y", "width", "height", "rx"]) {
    const value = source.getAttribute(attribute);
    if (value !== null) ghost.setAttribute(attribute, value);
  }
  ghost.setAttribute("class", "task-drag-ghost");
  svg.append(ghost);
  return ghost;
}

function taskIdAtPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): string | undefined {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const interactive = element.closest("[data-task-id]")?.getAttribute("data-task-id");
    if (interactive) return interactive;
    const visual = element.closest("[data-visual-task-id]")?.getAttribute("data-visual-task-id");
    if (visual) return visual;
  }
  if (!svg) return undefined;
  for (const group of svg.querySelectorAll<SVGGElement>("[data-task-id]")) {
    const targets = group.querySelectorAll<SVGGraphicsElement>(".bar, .label-hit");
    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      if (
        clientX >= rect.left - 4 &&
        clientX <= rect.right + 4 &&
        clientY >= rect.top - 6 &&
        clientY <= rect.bottom + 6
      )
        return group.getAttribute("data-task-id") ?? undefined;
    }
  }
  return undefined;
}

function highlightConnectionTarget(svg: SVGSVGElement | null, taskId: string | undefined): void {
  if (!svg) return;
  for (const group of svg.querySelectorAll<SVGGElement>("[data-task-id]")) {
    group.classList.toggle("connection-target", group.getAttribute("data-task-id") === taskId);
  }
}

function previewDependencyPaths(svg: SVGSVGElement | null, taskId: string, offsetX: number, widthDelta: number): void {
  if (!svg) return;
  for (const path of svg.querySelectorAll<SVGPathElement>(".interaction-dependency")) {
    let x1 = Number(path.getAttribute("data-x1"));
    const y1 = Number(path.getAttribute("data-y1"));
    let x2 = Number(path.getAttribute("data-x2"));
    const y2 = Number(path.getAttribute("data-y2"));
    if (path.getAttribute("data-predecessor-task-id") === taskId) {
      x1 += offsetX;
      if (path.getAttribute("data-predecessor-anchor") === "end") x1 += widthDelta;
    }
    if (path.getAttribute("data-successor-task-id") === taskId) {
      x2 += offsetX;
      if (path.getAttribute("data-successor-anchor") === "end") x2 += widthDelta;
    }
    if (
      path.getAttribute("data-predecessor-task-id") !== taskId &&
      path.getAttribute("data-successor-task-id") !== taskId
    )
      continue;
    const bend = Math.max(12, Math.abs(x2 - x1) / 3);
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.classList.add("previewing");
  }
}

function resetDependencyPaths(svg: SVGSVGElement | null): void {
  if (!svg) return;
  for (const path of svg.querySelectorAll<SVGPathElement>(".interaction-dependency.previewing")) {
    const original = path.getAttribute("data-original-d");
    if (original) path.setAttribute("d", original);
    path.classList.remove("previewing");
  }
}

export function svgScreenScale(svg: SVGSVGElement | null): number {
  if (!svg) return 1;
  const viewBoxWidth = Number(svg.getAttribute("viewBox")?.trim().split(/\s+/)[2]);
  const renderedWidth = svg.getBoundingClientRect().width;
  return viewBoxWidth > 0 && renderedWidth > 0 ? renderedWidth / viewBoxWidth : 1;
}

function addIsoDays(value: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resizeTaskFeedback(task: GanttTask | undefined, deltaDays: number): string | undefined {
  if (!task?.duration) return deltaDays ? `Resize ${deltaDays > 0 ? "+" : ""}${deltaDays} days` : undefined;
  const unitDays = task.duration.unit === "month" ? 30 : task.duration.unit === "week" ? 7 : 1;
  const durationDays = Math.max(1, task.duration.value * unitDays + deltaDays);
  const suffix = ` · ${durationDays} day${durationDays === 1 ? "" : "s"} (${deltaDays > 0 ? "+" : ""}${deltaDays})`;
  const endDate = task.start?.resolved ? addIsoDays(task.start.value, durationDays - 1) : undefined;
  return endDate ? `Ends ${endDate}${suffix}` : `Duration${suffix}`;
}
