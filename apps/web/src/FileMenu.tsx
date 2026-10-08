import { useEffect, useRef, useState } from "react";

export function FileMenu({
  canExport,
  saving = false,
  onNew,
  onNewProject,
  onOpen,
  onOpenProject,
  onProjectConnections,
  projectName,
  onSave,
  onSaveAs,
  onVersionHistory,
  onDocumentSettings,
  onDeliveryScenario,
  onJira,
  onBackup,
  onRestore,
  onExportSource,
  onExportSvg,
  onExportPng,
  onExportPdf,
  onCopyImage,
  onCopyMarkdown,
  onCopyConfluence,
}: {
  canExport: boolean;
  saving?: boolean;
  onNew(): void;
  onNewProject?: (() => void) | undefined;
  onOpen(): void;
  onOpenProject?: (() => void) | undefined;
  onProjectConnections?: (() => void) | undefined;
  projectName?: string | undefined;
  onSave(): void;
  onSaveAs(): void;
  onVersionHistory(): void;
  onDocumentSettings?: (() => void) | undefined;
  onDeliveryScenario?: (() => void) | undefined;
  onJira?: (() => void) | undefined;
  onBackup(): void;
  onRestore(): void;
  onExportSource(): void;
  onExportSvg(): void;
  onExportPng(): void;
  onExportPdf(): void;
  onCopyImage(): void;
  onCopyMarkdown(): void;
  onCopyConfluence(): void;
}) {
  const [open, setOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<"project" | "new" | "open" | "export">();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setActiveSubmenu(undefined);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  };
  const run = (action: () => void) => {
    close();
    action();
  };

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  const focusMenuItem = (direction: 1 | -1) => {
    const menu = document.activeElement?.closest('[role="menu"]') ?? root.current?.querySelector('[role="menu"]');
    const items = [
      ...(menu?.querySelectorAll<HTMLButtonElement>(
        ':scope > button[role="menuitem"]:not(:disabled), :scope > .application-submenu > button[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(current + direction + items.length) % items.length]?.focus();
  };

  return (
    <div className="application-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setActiveSubmenu(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
          }
        }}
      >
        File
      </button>
      {open && (
        <div
          className="application-menu-panel"
          role="menu"
          aria-label="File"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem(event.key === "ArrowDown" ? 1 : -1);
            }
            if (event.key === "ArrowRight") {
              const button = document.activeElement as HTMLButtonElement;
              if (button?.getAttribute("aria-haspopup") !== "menu") return;
              event.preventDefault();
              button.click();
              requestAnimationFrame(() =>
                button.parentElement
                  ?.querySelector<HTMLButtonElement>('[role="menu"] [role="menuitem"]:not(:disabled)')
                  ?.focus(),
              );
            }
            if (event.key === "ArrowLeft") {
              const submenu = document.activeElement?.closest(".application-submenu-panel")?.parentElement;
              if (!submenu) return;
              event.preventDefault();
              setActiveSubmenu(undefined);
              submenu.querySelector<HTMLButtonElement>(":scope > button")?.focus();
            }
          }}
        >
          {onProjectConnections && (
            <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("project")}>
              <button
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={activeSubmenu === "project"}
                onClick={() => setActiveSubmenu("project")}
              >
                <span>Document: {projectName}</span>
                <span aria-hidden="true">›</span>
              </button>
              {activeSubmenu === "project" && (
                <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Document">
                  <button role="menuitem" onClick={() => run(onProjectConnections)}>
                    Diagram connections
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("new")}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "new"}
              onClick={() => setActiveSubmenu("new")}
            >
              <span>New</span>
              <span aria-hidden="true">›</span>
            </button>
            {activeSubmenu === "new" && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="New">
                <button role="menuitem" onClick={() => run(onNew)}>
                  Diagram…
                </button>
                {onNewProject && (
                  <button role="menuitem" onClick={() => run(onNewProject)}>
                    Document…
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("open")}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "open"}
              onClick={() => setActiveSubmenu("open")}
            >
              <span>Open</span>
              <span aria-hidden="true">›</span>
            </button>
            {activeSubmenu === "open" && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Open">
                <button role="menuitem" onClick={() => run(onOpen)}>
                  Diagram…
                </button>
                {onOpenProject && (
                  <button role="menuitem" onClick={() => run(onOpenProject)}>
                    Document…
                  </button>
                )}
              </div>
            )}
          </div>
          <button role="menuitem" disabled={saving} onClick={() => run(onSave)}>
            <span>Save</span>
            <kbd aria-hidden="true">Ctrl/Cmd+S</kbd>
          </button>
          <button role="menuitem" disabled={saving} onClick={() => run(onSaveAs)}>
            Save as…
          </button>
          <button role="menuitem" onClick={() => run(onVersionHistory)}>
            Version history…
          </button>
          <button role="menuitem" onClick={() => run(() => onDocumentSettings?.())}>
            Document settings…
          </button>
          {onDeliveryScenario && (
            <button role="menuitem" onClick={() => run(onDeliveryScenario)}>
              Gantt analysis…
            </button>
          )}
          {onJira && (
            <button role="menuitem" onClick={() => run(onJira)}>
              Integrations: Jira…
            </button>
          )}
          <span className="menu-separator" role="separator" />
          <button role="menuitem" onClick={() => run(onBackup)}>
            Workspace backup…
          </button>
          <button role="menuitem" onClick={() => run(onRestore)}>
            Workspace restore…
          </button>
          <span className="menu-separator" role="separator" />
          <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("export")}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "export"}
              onClick={() => setActiveSubmenu("export")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveSubmenu("export");
                  requestAnimationFrame(() =>
                    root.current
                      ?.querySelector<HTMLButtonElement>('.application-submenu-panel [role="menuitem"]')
                      ?.focus(),
                  );
                }
              }}
            >
              <span>Export</span>
              <span aria-hidden="true">›</span>
            </button>
            {activeSubmenu === "export" && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Export">
                <button role="menuitem" onClick={() => run(onExportSource)}>
                  Source
                </button>
                <button role="menuitem" disabled={!canExport} onClick={() => run(onExportSvg)}>
                  SVG
                </button>
                <button role="menuitem" disabled={!canExport} onClick={() => run(onExportPng)}>
                  PNG
                </button>
                <button role="menuitem" disabled={!canExport} onClick={() => run(onExportPdf)}>
                  PDF
                </button>
                <span className="menu-separator" role="separator" />
                <button role="menuitem" disabled={!canExport} onClick={() => run(onCopyImage)}>
                  Copy image
                </button>
                <button
                  role="menuitem"
                  title="Copy the source as a fenced plantuml code block"
                  onClick={() => run(onCopyMarkdown)}
                >
                  Copy as Markdown
                </button>
                <button
                  role="menuitem"
                  title="Copy wiki markup for the PlantUML for Confluence macro"
                  onClick={() => run(onCopyConfluence)}
                >
                  Copy for Confluence
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
