import { memo, useEffect, useRef, useState } from "react";
import { optionShortcut } from "./platform-shortcuts";
import type { DiagramKind } from "./model";

function AddMenuView({
  diagramKind,
  disabled = false,
  inline = false,
  onTask,
  onMilestone,
  onDivider,
  onClosedDay,
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
  onClassEntity,
  onClassRelationship,
  onClassPackage,
  onClassNote,
  onActivityAction,
  onActivityPartition,
  onActivityNote,
  onActivityStructure,
  onActivityTerminal,
  onActivityArrow,
  onWbsNode,
  onMindmapNode,
  onC4Person,
  onC4System,
  onC4Container,
  onC4Component,
  onC4Boundary,
  onC4Node,
  onC4Relationship,
}: {
  diagramKind: DiagramKind;
  disabled?: boolean | undefined;
  inline?: boolean;
  onTask(): void;
  onMilestone(): void;
  onDivider(): void;
  onClosedDay(): void;
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
  onClassEntity(): void;
  onClassRelationship(): void;
  onClassPackage(): void;
  onClassNote(): void;
  onActivityAction(): void;
  onActivityPartition(): void;
  onActivityNote(): void;
  onActivityStructure(): void;
  onActivityTerminal(): void;
  onActivityArrow(): void;
  onWbsNode(): void;
  onMindmapNode(): void;
  onC4Person(): void;
  onC4System(): void;
  onC4Container(): void;
  onC4Component(): void;
  onC4Boundary(): void;
  onC4Node(): void;
  onC4Relationship(): void;
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
    if (!inline) trigger.current?.focus();
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
    <div
      className={inline ? "ribbon-insert" : "application-menu"}
      ref={root}
      data-inspector-trigger={diagramKind === "gantt" || undefined}
    >
      {!inline && (
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          title={disabled ? "Viewing only" : undefined}
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
      )}
      {(inline || open) && (
        <div
          className={inline ? "ribbon-insert-actions" : "application-menu-panel"}
          role={inline ? "group" : "menu"}
          aria-label={inline ? "New diagram elements" : "Add"}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              focusMenuItem(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
        >
          {diagramKind === "gantt" ? (
            <>
              <button
                aria-keyshortcuts="Alt+T"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onTask)}
              >
                <span>Task…</span>
                <kbd aria-hidden="true">{taskShortcut}</kbd>
              </button>
              <button
                aria-keyshortcuts="Alt+M"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onMilestone)}
              >
                <span>Milestone…</span>
                <kbd aria-hidden="true">{milestoneShortcut}</kbd>
              </button>
              <button
                aria-keyshortcuts="Alt+D"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onDivider)}
              >
                <span>Divider…</span>
                <kbd aria-hidden="true">{dividerShortcut}</kbd>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onClosedDay)}
              >
                Closed day…
              </button>
            </>
          ) : diagramKind === "sequence" ? (
            <>
              <button
                aria-keyshortcuts="Alt+P"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onParticipant)}
              >
                <span>Participant…</span>
                <kbd aria-hidden="true">{optionShortcut("P")}</kbd>
              </button>
              <button
                aria-keyshortcuts="Alt+M"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onMessage)}
              >
                <span>Message…</span>
                <kbd aria-hidden="true">{optionShortcut("M")}</kbd>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onFragment)}
              >
                <span>Combined fragment…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivation)}
              >
                <span>Activation…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onNote)}
              >
                <span>Note…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onSequenceSpacing)}
              >
                <span>Flow controls and page breaks…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onReference)}
              >
                <span>Reference…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onParticipantBox)}
              >
                <span>Participant box…</span>
              </button>
            </>
          ) : diagramKind === "usecase" ? (
            <>
              <button
                aria-keyshortcuts="Alt+A"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onUseCaseActor)}
              >
                <span>Actor…</span>
                <kbd aria-hidden="true">{optionShortcut("A")}</kbd>
              </button>
              <button
                aria-keyshortcuts="Alt+U"
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onUseCase)}
              >
                <span>Use case…</span>
                <kbd aria-hidden="true">{optionShortcut("U")}</kbd>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onUseCaseRelationship)}
              >
                <span>Relationship…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onUseCasePackage)}
              >
                <span>Package or boundary…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onUseCaseNote)}
              >
                <span>Note…</span>
              </button>
            </>
          ) : diagramKind === "class" || diagramKind === "component" ? (
            <>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onClassEntity)}
              >
                <span>
                  {diagramKind === "component" ? "Component or infrastructure…" : "Class, interface, or enum…"}
                </span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onClassRelationship)}
              >
                <span>Relationship…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onClassPackage)}
              >
                <span>{diagramKind === "component" ? "Package or node…" : "Package or namespace…"}</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onClassNote)}
              >
                <span>Note…</span>
              </button>
            </>
          ) : diagramKind === "activity" ? (
            <>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivityAction)}
              >
                <span>Action…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivityStructure)}
              >
                <span>Flow structure…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivityTerminal)}
              >
                <span>Terminal…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivityArrow)}
              >
                <span>Flow arrow…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivityPartition)}
              >
                <span>Partition…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onActivityNote)}
              >
                <span>Note…</span>
              </button>
            </>
          ) : diagramKind === "c4" ? (
            <>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4Person)}
              >
                <span>Person…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4System)}
              >
                <span>Software system…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4Container)}
              >
                <span>Container…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4Component)}
              >
                <span>Component…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4Boundary)}
              >
                <span>Boundary…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4Node)}
              >
                <span>Deployment node…</span>
              </button>
              <button
                role={inline ? undefined : "menuitem"}
                disabled={disabled}
                title={disabled ? "Viewing only" : undefined}
                onClick={() => run(onC4Relationship)}
              >
                <span>Relationship…</span>
              </button>
            </>
          ) : diagramKind === "mindmap" ? (
            <button
              aria-keyshortcuts="Alt+N"
              role={inline ? undefined : "menuitem"}
              disabled={disabled}
              title={disabled ? "Viewing only" : undefined}
              onClick={() => run(onMindmapNode)}
            >
              <span>Mindmap node…</span>
              <kbd aria-hidden="true">{optionShortcut("N")}</kbd>
            </button>
          ) : (
            <button
              aria-keyshortcuts="Alt+N"
              role={inline ? undefined : "menuitem"}
              disabled={disabled}
              title={disabled ? "Viewing only" : undefined}
              onClick={() => run(onWbsNode)}
            >
              <span>WBS node…</span>
              <kbd aria-hidden="true">{optionShortcut("N")}</kbd>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Skips re-rendering while its props are unchanged; callers pass stable handlers. */
export const AddMenu = memo(AddMenuView);
