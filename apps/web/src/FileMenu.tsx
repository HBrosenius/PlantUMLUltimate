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
  const [exportOpen, setExportOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
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
          <button role="menuitem" onClick={() => run(onNew)}>
            New
          </button>
          {onNewProject && (
            <button role="menuitem" onClick={() => run(onNewProject)}>
              New project…
            </button>
          )}
          {onNewZipProject && (
            <button role="menuitem" onClick={() => run(onNewZipProject)}>
              New ZIP project…
            </button>
          )}
          <button role="menuitem" onClick={() => run(onOpen)}>
            Open…
          </button>
          {onOpenProject && (
            <button role="menuitem" onClick={() => run(onOpenProject)}>
              Open project…
            </button>
          )}
          {onOpenZipProject && (
            <button role="menuitem" onClick={() => run(onOpenZipProject)}>
              Open ZIP project…
            </button>
          )}
          <button role="menuitem" onClick={() => run(onSave)}>
            Save
          </button>
          <button role="menuitem" onClick={() => run(onSaveAs)}>
            Save As…
          </button>
          {onSaveProject && (
            <button role="menuitem" onClick={() => run(onSaveProject)}>
              Save project snapshot…
            </button>
          )}
          {onProjectConnections && (
            <button role="menuitem" onClick={() => run(onProjectConnections)}>
              Diagram connections
            </button>
          )}
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
