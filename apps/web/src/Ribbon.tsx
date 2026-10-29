import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type RibbonCategory = "Edit" | "Insert" | "Plan" | "View";
const categories: RibbonCategory[] = ["Edit", "Insert", "Plan", "View"];

/** Command navigation owns no document, selection, inspector, or workspace-view state. */
export function Ribbon({
  file,
  utilities,
  identity,
  history,
  panels,
}: {
  file: ReactNode;
  utilities: ReactNode;
  identity: ReactNode;
  history: ReactNode;
  panels: Record<RibbonCategory, ReactNode>;
}) {
  const [category, setCategory] = useState<RibbonCategory>("Insert");
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  return (
    <div
      className="command-ribbon"
      data-inspector-trigger
      onClickCapture={(event) => {
        // WebKit does not focus mouse-activated buttons. Establish the invoking
        // control before a command opens a dialog or inspector.
        if (event.target instanceof Element)
          event.target.closest<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      }}
    >
      <header className="toolbar ribbon-header">
        <strong className="ribbon-brand">PlantUML Ultimate</strong>
        <div className="file-tools">{file}</div>
        <div ref={tabs} className="ribbon-categories" role="tablist" aria-label="Command categories">
          {categories.map((name, index) => (
            <button
              type="button"
              key={name}
              role="tab"
              id={`${id}-${name}`}
              aria-selected={category === name}
              aria-controls={`${id}-panel`}
              tabIndex={category === name ? 0 : -1}
              onClick={() => {
                setCategory(name);
                setCollapsed(false);
              }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? categories.length - 1
                      : (index + (event.key === "ArrowLeft" ? -1 : 1) + categories.length) % categories.length;
                setCategory(categories[next]!);
                tabs.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ribbon-collapse"
          aria-label={collapsed ? "Expand ribbon" : "Collapse ribbon"}
          aria-expanded={!collapsed}
          aria-controls={`${id}-panel`}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "▾" : "▴"}
        </button>
        <div className="ribbon-utilities">
          {history}
          {utilities}
        </div>
        {identity}
      </header>
      <section
        className="toolbar ribbon-panel"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${category}`}
        hidden={collapsed}
      >
        {categories.map((name) => (
          <div key={name} className="ribbon-category-panel" hidden={category !== name}>
            {panels[name]}
          </div>
        ))}
      </section>
    </div>
  );
}

/** Groups become named dropdowns when the ribbon cannot fit their commands. */
export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1100px)").matches);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const change = () => {
      setCompact(media.matches);
      setOpen(false);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!compact || !open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[role="dialog"], [role="alertdialog"], .modal-backdrop')
      )
        return;
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [compact, open]);
  return (
    <details
      ref={root}
      className="ribbon-group"
      name={compact ? "ribbon-command-groups" : undefined}
      open={!compact || open}
      onToggle={(event) => {
        if (compact) setOpen(event.currentTarget.open);
      }}
      onKeyDown={(event) => {
        if (compact && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          root.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>{label}</summary>
      <div className="ribbon-group-content" role="group" aria-label={label}>
        {children}
      </div>
    </details>
  );
}

export function WorkspaceNavigation({
  documents,
  views,
  hint,
}: {
  documents: ReactNode;
  views: ReactNode;
  hint: ReactNode;
}) {
  return (
    <div className="workspace-navigation">
      {documents}
      <section className="toolbar workspace-toolbar" aria-label="Workspace views">
        {views}
        {hint}
      </section>
    </div>
  );
}
