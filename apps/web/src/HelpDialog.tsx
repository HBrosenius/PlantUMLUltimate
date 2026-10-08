import { useRef } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { optionShortcut } from "./platform-shortcuts";

const shortcuts = () => [
  ["⌘/Ctrl + N", "New diagram"],
  ["⌘/Ctrl + O", "Open document"],
  ["⌘/Ctrl + S", "Save"],
  ["⌘/Ctrl + W", "Close active tab"],
  [optionShortcut("T"), "Add task"],
  [optionShortcut("M"), "Add milestone"],
  [optionShortcut("D"), "Add divider"],
  [optionShortcut("N"), "Add WBS node"],
  ["Shift or ⌘/Ctrl + click", "Toggle diagram element selection"],
  ["⌘/Ctrl + A", "Select all elements when a non-Gantt diagram has focus"],
  ["⌘/Ctrl + C / V / D", "Copy / paste / duplicate selected diagram elements"],
  ["⌘/Ctrl + Z", "Undo"],
  ["⇧ + ⌘/Ctrl + Z", "Redo"],
  ["⌘/Ctrl + 1", "Code view"],
  ["⌘/Ctrl + 2", "Split view"],
  ["⌘/Ctrl + 3", "Diagram view"],
  ["⌘/Ctrl + ⇧ + O", "Diagram outline"],
  ["⌘/Ctrl + ⇧ + P", "Command palette"],
  ["↑ / ↓", "Move between diagram tasks"],
  ["Enter / Space", "Select focused task"],
  ["Alt + ← / →", "Move focused task one day"],
  ["Alt + Shift + ← / →", "Resize focused task one day"],
  ["Ctrl + ↑ / ↓", "Reorder focused task"],
  ["⌘/Ctrl + .", "Open source fix suggestions in the editor"],
  ["⌘/Ctrl + Shift + M", "Explain the current or next source error"],
  ["F8 / Shift + F8", "Next / previous source error"],
  ["F2", "Rename a semantic symbol under the code cursor"],
  ["Shift while dragging", "Snap movement to weeks"],
  ["?", "Open Help"],
  ["Shift + F10 on a tab", "Open tab actions, including moving tabs left or right"],
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
            <h3>Workspace controls</h3>
            <p>
              File, Save, undo/redo, Commands, and Collaborate are above the diagram tabs. Add, Outline, diagram
              settings, and Code / Split / Diagram are in the workspace toolbar. More contains Settings and Help. Change
              the app theme in Settings → Appearance or through Commands.
            </p>
            <p>
              File saving and browser recovery are separate. Saved to file confirms a file write; Download requested
              means a snapshot was sent to your browser downloads. Browser recovery restores local work and does not
              save your file. Open Issues for errors, warnings, and source that can only be edited in Code view.
            </p>
            <p>
              Use Linked diagrams for WBS/Gantt synchronization and connection review. Fit sizes the diagram to its
              canvas.
            </p>
          </section>
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
                In the code editor, task, person, Sequence participant, Use Case, Class entity, Activity, and WBS
                symbols highlight together; press F2 to rename or right-click to find and navigate references.
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
              <li>Use Calendar &amp; schedule for calendars and Workload for resource workload and capacity.</li>
              <li>
                In More → Settings → Gantt, turn off resource over-allocation warnings when an assignee represents a
                team. Workload details remain available.
              </li>
            </ul>
          </section>
          <section>
            <h3>Scheduling</h3>
            <p>
              When moving tasks controls whether downstream dated tasks move automatically. Relative PlantUML tasks
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
