import { useEffect, useRef, useState } from "react";

export function FileMenu({
  canExport,
  onNew,
  onNewProject,
  onOpen,
  onSaveProject,
  onProjectConnections,
  projectName,
  onSave,
  onSaveAs,
  onVersionHistory,
  onDocumentSettings,
  onJira,
  onBackup,
  onRestore,
  onExportSource,
  onExportSvg,
  onExportPng,
}: {
  canExport: boolean;
  onNew(): void;
  onNewProject?: (() => void) | undefined;
  onOpen(): void;
  onSaveProject?: (() => void) | undefined;
  onProjectConnections?: (() => void) | undefined;
  projectName?: string | undefined;
  onSave(): void;
  onSaveAs(): void;
  onVersionHistory(): void;
  onDocumentSettings?: (() => void) | undefined;
  onJira?: (() => void) | undefined;
  onBackup(): void;
  onRestore(): void;
  onExportSource(): void;
  onExportSvg(): void;
  onExportPng(): void;
}) {
  const [open, setOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<"project" | "new" | "open" | "save" | "export">();
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
  const toggleSubmenu = (submenu: NonNullable<typeof activeSubmenu>) =>
    setActiveSubmenu((current) => (current === submenu ? undefined : submenu));

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
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
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
          }}
        >
          {onProjectConnections && (
            <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("project")}>
              <button
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={activeSubmenu === "project"}
                onClick={() => toggleSubmenu("project")}
              >
                <span>Project: {projectName}</span>
                <span aria-hidden="true">›</span>
              </button>
              {activeSubmenu === "project" && (
                <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Project">
                  <button role="menuitem" onClick={() => run(onProjectConnections)}>
                    Diagram connections
                  </button>
                  {onSaveProject && (
                    <button role="menuitem" onClick={() => run(onSaveProject)}>
                      Save project snapshot…
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("new")}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "new"}
              onClick={() => toggleSubmenu("new")}
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
                    Project…
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
              onClick={() => toggleSubmenu("open")}
            >
              <span>Open</span>
              <span aria-hidden="true">›</span>
            </button>
            {activeSubmenu === "open" && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Open">
                <button role="menuitem" onClick={() => run(onOpen)}>
                  Project or diagram…
                </button>
              </div>
            )}
          </div>
          <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("save")}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "save"}
              onClick={() => toggleSubmenu("save")}
            >
              <span>Save</span>
              <span aria-hidden="true">›</span>
            </button>
            {activeSubmenu === "save" && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Save">
                <button role="menuitem" onClick={() => run(onSave)}>
                  {onSaveProject ? "Save project" : "Save diagram"}
                </button>
                <button role="menuitem" onClick={() => run(onSaveAs)}>
                  {onSaveProject ? "Save project as…" : "Save diagram as…"}
                </button>
              </div>
            )}
          </div>
          <button role="menuitem" onClick={() => run(onVersionHistory)}>
            Version history…
          </button>
          <button role="menuitem" onClick={() => run(() => onDocumentSettings?.())}>
            Document settings…
          </button>
          {onJira && (
            <button role="menuitem" onClick={() => run(onJira)}>
              Jira…
            </button>
          )}
          <span className="menu-separator" role="separator" />
          <button role="menuitem" onClick={() => run(onBackup)}>
            Backup workspace…
          </button>
          <button role="menuitem" onClick={() => run(onRestore)}>
            Restore workspace…
          </button>
          <span className="menu-separator" role="separator" />
          <div className="application-submenu" onPointerEnter={() => setActiveSubmenu("export")}>
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={activeSubmenu === "export"}
              onClick={() => toggleSubmenu("export")}
              onFocus={() => setActiveSubmenu("export")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
