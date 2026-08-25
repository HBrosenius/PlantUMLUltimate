import { useEffect, useRef, useState } from "react";
import { optionShortcut } from "./platform-shortcuts";
import type { DiagramKind } from "./model";

export function AddMenu({
  diagramKind,
  onTask,
  onMilestone,
  onDivider,
  onParticipant,
  onMessage,
  onFragment,
  onActivation,
  onNote,
  onSequenceSpacing,
  onReference,
  onParticipantBox,
  onUseCaseActor,
  onUseCase,
  onUseCaseRelationship,
  onUseCasePackage,
  onUseCaseNote,
}: {
  diagramKind: DiagramKind;
  onTask(): void;
  onMilestone(): void;
  onDivider(): void;
  onParticipant(): void;
  onMessage(): void;
  onFragment(): void;
  onActivation(): void;
  onNote(): void;
  onSequenceSpacing(): void;
  onReference(): void;
  onParticipantBox(): void;
  onUseCaseActor(): void;
  onUseCase(): void;
  onUseCaseRelationship(): void;
  onUseCasePackage(): void;
  onUseCaseNote(): void;
}) {
  const taskShortcut = optionShortcut("T");
  const milestoneShortcut = optionShortcut("M");
  const dividerShortcut = optionShortcut("D");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  };
  const run = (action: () => void) => {
    trigger.current?.focus();
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
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
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
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
          }
        }}
      >
        Add
      </button>
      {open && (
        <div
          className="application-menu-panel"
          role="menu"
          aria-label="Add"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {diagramKind === "gantt" ? (
            <>
              <button role="menuitem" onClick={() => run(onTask)}>
                <span>Task…</span>
                <kbd>{taskShortcut}</kbd>
              </button>
              <button role="menuitem" onClick={() => run(onMilestone)}>
                <span>Milestone…</span>
                <kbd>{milestoneShortcut}</kbd>
              </button>
              <button role="menuitem" onClick={() => run(onDivider)}>
                <span>Divider…</span>
                <kbd>{dividerShortcut}</kbd>
              </button>
            </>
          ) : diagramKind === "sequence" ? (
            <>
              <button role="menuitem" onClick={() => run(onParticipant)}>
                <span>Participant…</span>
                <kbd>{optionShortcut("P")}</kbd>
              </button>
              <button role="menuitem" onClick={() => run(onMessage)}>
                <span>Message…</span>
                <kbd>{optionShortcut("M")}</kbd>
              </button>
              <button role="menuitem" onClick={() => run(onFragment)}>
                <span>Combined fragment…</span>
              </button>
              <button role="menuitem" onClick={() => run(onActivation)}>
                <span>Activation…</span>
              </button>
              <button role="menuitem" onClick={() => run(onNote)}>
                <span>Note…</span>
              </button>
              <button role="menuitem" onClick={() => run(onSequenceSpacing)}>
                <span>Flow controls and page breaks…</span>
              </button>
              <button role="menuitem" onClick={() => run(onReference)}>
                <span>Reference…</span>
              </button>
              <button role="menuitem" onClick={() => run(onParticipantBox)}>
                <span>Participant box…</span>
              </button>
            </>
          ) : (
            <>
              <button role="menuitem" onClick={() => run(onUseCaseActor)}>
                <span>Actor…</span>
                <kbd>{optionShortcut("A")}</kbd>
              </button>
              <button role="menuitem" onClick={() => run(onUseCase)}>
                <span>Use case…</span>
                <kbd>{optionShortcut("U")}</kbd>
              </button>
              <button role="menuitem" onClick={() => run(onUseCaseRelationship)}>
                <span>Relationship…</span>
              </button>
              <button role="menuitem" onClick={() => run(onUseCasePackage)}>
                <span>Package or boundary…</span>
              </button>
              <button role="menuitem" onClick={() => run(onUseCaseNote)}>
                <span>Note…</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
