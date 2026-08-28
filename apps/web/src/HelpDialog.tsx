import { useRef } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { optionShortcut } from "./platform-shortcuts";

const shortcuts = () => [
  ["⌘/Ctrl + N", "New document"],
  ["⌘/Ctrl + O", "Open document"],
  ["⌘/Ctrl + S", "Save"],
  ["⌘/Ctrl + W", "Close active tab"],
  [optionShortcut("T"), "Add task"],
  [optionShortcut("M"), "Add milestone"],
  [optionShortcut("D"), "Add divider"],
  [optionShortcut("N"), "Add WBS node"],
  ["⌘/Ctrl + Z", "Undo"],
  ["⇧ + ⌘/Ctrl + Z", "Redo"],
  ["⌘/Ctrl + 1", "Code view"],
  ["⌘/Ctrl + 2", "Split view"],
  ["⌘/Ctrl + 3", "Diagram view"],
  ["⌘/Ctrl + ⇧ + P", "Command palette"],
  ["↑ / ↓", "Move between diagram tasks"],
  ["Enter / Space", "Select focused task"],
  ["Alt + ← / →", "Move focused task one day"],
  ["Alt + Shift + ← / →", "Resize focused task one day"],
  ["Ctrl + ↑ / ↓", "Reorder focused task"],
  ["F2", "Rename a semantic symbol under the code cursor"],
  ["Shift while dragging", "Snap movement to weeks"],
  ["?", "Open Help"],
  ["Escape", "Close a dialog"],
];

const example = `[Build] starts 2026-09-01
[Build] lasts 5 days
[Build] is colored in Orange
[Test] starts at [Build]'s end
[Build] on {Alice:50%} {Bob:100%} lasts 5 days
today is colored in #AAF`;

export function HelpDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, onClose);
  return (
    <div
      className="modal-backdrop help-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <header>
          <div>
            <h2 id="help-title">PlantUML Ultimate Help</h2>
            <p>Keyboard, diagram interaction, and PlantUML editing reference</p>
          </div>
          <button onClick={onClose} aria-label="Close Help">
            ×
          </button>
        </header>
        <div className="help-content">
          <section>
            <h3>Keyboard shortcuts</h3>
            <div className="shortcut-grid">
              {shortcuts().map(([keys, action]) => (
                <div key={keys}>
                  <kbd>{keys}</kbd>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3>Diagram interaction</h3>
            <ul>
              <li>Click a task box or name to open its inspector.</li>
              <li>Drag horizontally to move it between dates.</li>
              <li>Drag vertically to reorder it; the target row turns green.</li>
              <li>Drag the right edge to resize duration.</li>
              <li>Drag the round right anchor to another task to create a dependency.</li>
              <li>Hover a task for dates, people, and dependency navigation.</li>
              <li>Click a dependency line to inspect or delete it.</li>
              <li>
                In the code editor, task, person, Sequence participant, actor, and use case references highlight
                together; press F2 to rename or right-click to find and navigate references.
              </li>
            </ul>
          </section>
          <section>
            <h3>Common syntax</h3>
            <pre>{example}</pre>
          </section>
          <section>
            <h3>WBS diagrams</h3>
            <ul>
              <li>
                Use repeated <code>*</code> markers to define hierarchy.
              </li>
              <li>
                Use repeated <code>+</code> or <code>-</code> markers for right and left branches.
              </li>
              <li>Select a rendered node to edit it, or drag it onto another node to move its complete subtree.</li>
              <li>The node inspector controls its label, branch side, color, and stereotype.</li>
            </ul>
          </section>
          <section>
            <h3>Editor assistance</h3>
            <ul>
              <li>
                Type <code>[</code> on a new line to complete an existing task.
              </li>
              <li>Task, person, color, and dependency names autocomplete from the document.</li>
              <li>Open the lightbulb on supported diagnostics to apply a quick fix.</li>
              <li>Use Project for calendars and Resources for workload and capacity.</li>
            </ul>
          </section>
          <section>
            <h3>Scheduling</h3>
            <p>
              The Schedule selector controls whether downstream dated tasks move automatically. Relative PlantUML tasks
              follow their predecessor naturally. Cascade changes and diagram edits are recorded as single undo
              operations.
            </p>
          </section>
        </div>
        <footer>
          <span>PlantUML Ultimate · Local-first browser editor</span>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
