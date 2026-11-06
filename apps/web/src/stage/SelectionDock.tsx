import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { AddItem, DockAction, StageSelection } from "./stage-selection";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Follows the selected element's rendered position (pan, zoom, resize and edits all move it). */
function useAnchorRect(container: RefObject<HTMLElement | null>, selector: string | undefined): Rect | undefined {
  const [rect, setRect] = useState<Rect>();
  useEffect(() => {
    if (!selector) {
      setRect(undefined);
      return;
    }
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const root = container.current;
      if (!root) return;
      const elements = (() => {
        try {
          return [...root.querySelectorAll(selector)];
        } catch {
          return [];
        }
      })();
      const boxes = elements.map((element) => element.getBoundingClientRect()).filter((box) => box.width || box.height);
      if (!boxes.length) {
        setRect((current) => (current ? undefined : current));
        return;
      }
      const base = root.getBoundingClientRect();
      const left = Math.min(...boxes.map((box) => box.left)) - base.left;
      const top = Math.min(...boxes.map((box) => box.top)) - base.top;
      const right = Math.max(...boxes.map((box) => box.right)) - base.left;
      const bottom = Math.max(...boxes.map((box) => box.bottom)) - base.top;
      const next = { left, top, width: right - left, height: bottom - top };
      setRect((current) =>
        current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.height - next.height) < 0.5
          ? current
          : next,
      );
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [container, selector]);
  return rect;
}

export interface SelectionDockProps {
  container: RefObject<HTMLElement | null>;
  selection: StageSelection | undefined;
  actions: DockAction[];
  addItems: AddItem[];
  addLabel: string;
  addDisabled: boolean;
  inspectorOpen: boolean;
  onToggleInspector(): void;
}

const DOCK_HEIGHT = 40;
const GAP = 10;

/**
 * Floating toolbar next to the selected object: a few actions that reuse the feature action hooks, and ⋯ for
 * the full inspector. With nothing selected it offers "+ Add" for the diagram type.
 */
export function SelectionDock({
  container,
  selection,
  actions,
  addItems,
  addLabel,
  addDisabled,
  inspectorOpen,
  onToggleInspector,
}: SelectionDockProps) {
  const rect = useAnchorRect(container, selection?.anchor);
  const dock = useRef<HTMLDivElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [size, setSize] = useState({ width: 240, height: DOCK_HEIGHT });
  useEffect(() => setAddOpen(false), [selection?.kind, selection?.id]);
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const measure = () => setSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selection?.kind, selection?.id]);

  const bounds = container.current?.getBoundingClientRect();
  let style: React.CSSProperties;
  let placement: "anchored" | "floating" = "floating";
  if (selection && rect && bounds) {
    placement = "anchored";
    const below = rect.top + rect.height + GAP;
    const top = below + size.height + 56 > bounds.height ? Math.max(8, rect.top - size.height - GAP) : below;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - size.width / 2),
      Math.max(8, bounds.width - size.width - 8),
    );
    style = { left, top };
  } else {
    style = {};
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (addOpen) {
        setAddOpen(false);
        return;
      }
      container.current?.querySelector<HTMLElement>(".preview-viewport")?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    const buttons = [...(dock.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  const label = selection ? `Actions for ${selection.label}` : "Add to diagram";
  return (
    <div
      ref={dock}
      className="stage-dock"
      data-placement={placement}
      data-testid="stage-dock"
      role="toolbar"
      aria-label={label}
      style={style}
      onKeyDown={onKeyDown}
    >
      {selection && <span className="stage-dock-label">{selection.label}</span>}
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={action.tone === "danger" ? "danger" : undefined}
          title={action.title}
          disabled={action.disabled}
          onClick={action.run}
        >
          {action.label}
        </button>
      ))}
      {!selection && addItems.length > 0 && (
        <div className="stage-dock-add">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={addOpen}
            disabled={addDisabled}
            title={addDisabled ? "Viewing only" : addLabel}
            onClick={() => setAddOpen((open) => !open)}
          >
            + Add
          </button>
          {addOpen && (
            <div className="stage-dock-menu" role="menu" aria-label={addLabel}>
              {addItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddOpen(false);
                    item.run();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {selection && (
        <button
          type="button"
          aria-label="Open inspector"
          aria-pressed={inspectorOpen}
          title="Open the full inspector"
          onClick={onToggleInspector}
        >
          ⋯ Inspector
        </button>
      )}
    </div>
  );
}
