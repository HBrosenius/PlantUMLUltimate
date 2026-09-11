import { useEffect, useRef, useState } from "react";

export function FileMenu({
  canExport,
  onNew,
  onNewProject,
  onNewZipProject,
  onOpen,
  onOpenProject,
  onOpenZipProject,
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
  onNewZipProject?: (() => void) | undefined;
  onOpen(): void;
  onOpenProject?: (() => void) | undefined;
  onOpenZipProject?: (() => void) | undefined;
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
  const [newOpen, setNewOpen] = useState(false);
  const [openItemsOpen, setOpenItemsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    setNewOpen(false);
    setOpenItemsOpen(false);
    setSaveOpen(false);
    setProjectOpen(false);
    setExportOpen(false);
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
          setNewOpen(false);
          setOpenItemsOpen(false);
          setSaveOpen(false);
          setProjectOpen(false);
          setExportOpen(false);
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
            <div
              className="application-submenu"
              onPointerEnter={() => setProjectOpen(true)}
              onPointerLeave={() => setProjectOpen(false)}
            >
              <button
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={projectOpen}
                onClick={() => setProjectOpen((value) => !value)}
              >
                <span>Project: {projectName}</span>
                <span aria-hidden="true">›</span>
              </button>
              {projectOpen && (
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
          <div
            className="application-submenu"
            onPointerEnter={() => setNewOpen(true)}
            onPointerLeave={() => setNewOpen(false)}
          >
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={newOpen}
              onClick={() => setNewOpen((value) => !value)}
            >
              <span>New</span>
              <span aria-hidden="true">›</span>
            </button>
            {newOpen && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="New">
                <button role="menuitem" onClick={() => run(onNew)}>
                  Diagram…
                </button>
                {onNewProject && (
                  <button role="menuitem" onClick={() => run(onNewProject)}>
                    Folder project…
                  </button>
                )}
                {onNewZipProject && (
                  <button role="menuitem" onClick={() => run(onNewZipProject)}>
                    ZIP project…
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            className="application-submenu"
            onPointerEnter={() => setOpenItemsOpen(true)}
            onPointerLeave={() => setOpenItemsOpen(false)}
          >
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={openItemsOpen}
              onClick={() => setOpenItemsOpen((value) => !value)}
            >
              <span>Open</span>
              <span aria-hidden="true">›</span>
            </button>
            {openItemsOpen && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Open">
                <button role="menuitem" onClick={() => run(onOpen)}>
                  Diagram…
                </button>
                {onOpenProject && (
                  <button role="menuitem" onClick={() => run(onOpenProject)}>
                    Folder project…
                  </button>
                )}
                {onOpenZipProject && (
                  <button role="menuitem" onClick={() => run(onOpenZipProject)}>
                    ZIP project…
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            className="application-submenu"
            onPointerEnter={() => setSaveOpen(true)}
            onPointerLeave={() => setSaveOpen(false)}
          >
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={saveOpen}
              onClick={() => setSaveOpen((value) => !value)}
            >
              <span>Save</span>
              <span aria-hidden="true">›</span>
            </button>
            {saveOpen && (
              <div className="application-menu-panel application-submenu-panel" role="menu" aria-label="Save">
                <button role="menuitem" onClick={() => run(onSave)}>
                  Save diagram
                </button>
                <button role="menuitem" onClick={() => run(onSaveAs)}>
                  Save diagram as…
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
          <div
            className="application-submenu"
            onPointerEnter={() => setExportOpen(true)}
            onPointerLeave={() => setExportOpen(false)}
          >
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((value) => !value)}
              onFocus={() => setExportOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setExportOpen(true);
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
            {exportOpen && (
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
