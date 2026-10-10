import { useRef, useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";
import { isApplePlatform, optionShortcut } from "./platform-shortcuts";
import type { DiagramKind } from "./model";

type Topic = {
  title: string;
  group: "General" | "Editing" | DiagramKind;
  paragraphs: string[];
  example?: string;
  collapsible?: boolean;
};
type Shortcut = { keys: string; action: string; group: Topic["group"] };
const names: Record<DiagramKind, string> = {
  gantt: "Gantt",
  sequence: "Sequence",
  wbs: "WBS",
  usecase: "Use Case",
  class: "Class",
  component: "Component",
  activity: "Activity",
};
const topics: Topic[] = [
  {
    title: "Quick tour",
    group: "General",
    collapsible: true,
    paragraphs: [
      "Use File → New to create a Blank diagram, a Simple starter, or a named example. Open loads an existing file. Use Add to build your diagram and click an item to edit its properties.",
      "Code / Split / Diagram changes your view. Outline helps navigate; Commands finds actions. For Gantt plans, explore Reports, Forecast and What-if scenarios in Plan.",
    ],
  },
  {
    title: "What’s new",
    group: "General",
    collapsible: true,
    paragraphs: [
      "Named diagrams within documents, clearer save status, coordinator report presets for unassigned work, and simpler property panels. File → New now leads straight to creating, opening, or trying an example.",
    ],
  },
  {
    title: "Workspace controls",
    group: "General",
    paragraphs: [
      "File, Save, Undo/Redo, Commands and Collaborate are above the diagram tabs. Add, Outline, diagram settings and Code / Split / Diagram are in the workspace toolbar. More contains Settings and Help. Change the app theme in Settings → Appearance or through Commands.",
      "File saving and browser recovery are separate. Saved to file confirms a file write; Download requested means a snapshot was sent to your browser downloads. Browser recovery restores local work and does not save your file. Open Issues for errors, warnings and source that can only be edited in Code view.",
      "Fit sizes the diagram to its canvas. Use Linked diagrams for WBS/Gantt synchronization and connection review.",
    ],
  },
  {
    title: "Source editing and diagnostics",
    group: "Editing",
    paragraphs: [
      "In the code editor, task, person, Sequence participant, Use Case, Class entity, Activity and WBS symbols highlight together. Use Rename symbol (F2) or right-click to Find references and navigate references.",
      "Names autocomplete from the document. Open the lightbulb on supported diagnostics to apply a quick fix. Explain error describes the current or next error; Previous error and Next error navigate diagnostics.",
      "Text fields keep their own undo and redo. Diagram copy, paste, duplicate and selection shortcuts apply when diagram elements have focus.",
    ],
  },
  {
    title: "Gantt interaction and scheduling",
    group: "gantt",
    paragraphs: [
      "Click a task box or name to open its inspector. Drag horizontally to move between dates, vertically to reorder, or drag the right edge to resize duration. The target row turns green. Hold Shift while dragging to snap movement to weeks.",
      "Drag the round right anchor to another task to create a dependency. Click a dependency line to inspect or delete it. Hover a task for dates, people and dependency navigation.",
      "Calendar & schedule controls working days. Workload shows resource workload and capacity. In More → Settings → Gantt, resource over-allocation warnings can be disabled for team assignees; workload details remain available.",
      "When moving tasks controls whether downstream dated tasks move automatically. Relative PlantUML tasks follow their predecessor. Cascade changes and diagram edits are recorded as single undo operations.",
      "Plan → Reports offers Task check-in, coordinator summaries, Delivery outlook, Progress forecast, Critical path and other reports. Report scope is independent of canvas filters. What-if scenario tests draft changes before review and apply.",
      "Type [ on a new line to complete an existing task.",
    ],
    example:
      "[Build] starts 2026-09-01\n[Build] lasts 5 days\n[Build] is colored in Orange\n[Test] starts at [Build]'s end\n[Build] on {Alice:50%} {Bob:100%} lasts 5 days\ntoday is colored in #AAF",
  },
  {
    title: "WBS diagrams",
    group: "wbs",
    paragraphs: [
      "Use repeated * markers to define hierarchy, and + or - markers for right and left branches. Select a rendered node to edit its label, branch side, color and stereotype.",
      "Drag a node onto another node to move its complete subtree. Use Linked diagrams to create or connect a Gantt plan. Add WBS node creates another work package.",
    ],
  },
  {
    title: "Sequence diagrams",
    group: "sequence",
    paragraphs: [
      "Use Add participant and Add message to build an interaction. Message participant pickers accept existing or new names. Advanced options include lifecycle modifiers, anchors and message types.",
      "Click an item to inspect it. Drag participants sideways and timeline elements vertically to reorder them. Add combined fragment, activation or note for more detail.",
    ],
  },
  {
    title: "Use Case diagrams",
    group: "usecase",
    paragraphs: [
      "Use Add for actors, use cases and relationships. Click an element to inspect it. Use the relationship tools to connect actors and capabilities; packages organize the system boundary.",
    ],
  },
  {
    title: "Class diagrams",
    group: "class",
    paragraphs: [
      "Use Add to create entities and relationships. Click an entity or member to inspect its properties. Model attributes, operations and relationships; packages group related types.",
    ],
  },
  {
    title: "Component diagrams",
    group: "component",
    paragraphs: [
      "Use Add to create components, interfaces and relationships. Click an element to inspect it. Model infrastructure, dependencies and boundaries; use Code for unsupported source constructs.",
    ],
  },
  {
    title: "Activity diagrams",
    group: "activity",
    paragraphs: [
      "Use Add for actions and workflow structure. Click an item to inspect it. Model decisions, parallel work, loops, partitions and outcomes. Outline helps navigate larger workflows.",
    ],
  },
];

function shortcuts(): Shortcut[] {
  const apple = isApplePlatform();
  const mod = (key: string, shift = false) =>
    apple ? `${shift ? "⇧" : ""}⌘${key}` : `Ctrl+${shift ? "Shift+" : ""}${key}`;
  const rows: Shortcut[] = [];
  const add = (group: Topic["group"], keys: string, action: string) => rows.push({ group, keys, action });
  for (const [key, action] of [
    ["N", "New diagram"],
    ["O", "Open…"],
    ["S", "Save"],
    ["W", "Close active tab"],
    ["1", "Code view"],
    ["2", "Split view"],
    ["3", "Diagram view"],
  ])
    add("General", mod(key!), action!);
  add("General", mod("O", true), "Diagram outline…");
  add("General", mod("P", true), "Commands / Command palette");
  add("General", "?", "Help & keyboard shortcuts (outside text fields)");
  add("General", "Shift+F10 on a tab", "Tab actions, including moving tabs left or right");
  add("General", "Escape", "Close a dialog");
  add("Editing", mod("Z"), "Undo");
  add("Editing", `${mod("Z", true)} / ${mod("Y")}`, "Redo");
  add("Editing", `Shift or ${apple ? "⌘" : "Ctrl"}+click`, "Toggle diagram element selection");
  add("Editing", mod("A"), "Select all elements when a non-Gantt diagram has focus");
  add("Editing", `${mod("C")} / ${mod("V")} / ${mod("D")}`, "Copy / paste / duplicate selected diagram elements");
  add("Editing", mod("."), "Open source fix suggestions in the editor");
  add("Editing", mod("M", true), "Explain error: current or next source error");
  add("Editing", "F8 / Shift+F8", "Next error / Previous error in source");
  add("Editing", "F2", "Rename symbol under the code cursor");
  for (const [key, action] of [
    ["T", "Add task…"],
    ["M", "Add milestone…"],
    ["D", "Add divider…"],
  ])
    add("gantt", optionShortcut(key!), action!);
  add("gantt", "↑ / ↓", "Move between diagram tasks");
  add("gantt", "Enter / Space", "Select focused task");
  add("gantt", `${apple ? "⌥" : "Alt+"}← / →`, "Move focused task one day");
  add("gantt", `${apple ? "⇧⌥" : "Alt+Shift+"}← / →`, "Resize focused task one day");
  add("gantt", "Ctrl+↑ / ↓", "Reorder focused task (Control on every platform)");
  add("gantt", "Shift while dragging", "Snap movement to weeks");
  add("wbs", optionShortcut("N"), "Add WBS node…");
  add("sequence", optionShortcut("P"), "Add participant…");
  add("sequence", optionShortcut("M"), "Add message…");
  return rows;
}

// Search accepts both native glyphs and familiar typed modifier names.
function searchable(text: string) {
  return text
    .toLowerCase()
    .replace(/⌘|command|cmd|control|ctrl|mod/g, "ctrl")
    .replace(/⌥|option|alt/g, "alt")
    .replace(/⇧/g, "shift")
    .replace(/…/g, "")
    .replace(/[+\s]+/g, "")
    .replace(/shiftctrl/g, "ctrlshift")
    .replace(/shiftalt/g, "altshift");
}

export function HelpDialog({ onClose, kind = "gantt" }: { onClose(): void; kind?: DiagramKind }) {
  const dialog = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("current");
  useDialogFocus(dialog, onClose);
  const matches = (text: string) => searchable(text).includes(searchable(query.trim()));
  const inScope = (group: Topic["group"]) =>
    scope === "all" || group === kind || group === "General" || group === "Editing";
  const groups: Topic["group"][] = [
    kind,
    "General",
    "Editing",
    ...(Object.keys(names).filter((name) => name !== kind) as DiagramKind[]),
  ];
  const sections = topics.filter(
    (topic) => inScope(topic.group) && matches([topic.title, ...topic.paragraphs, topic.example ?? ""].join(" ")),
  );
  const rows = shortcuts().filter(
    (row) =>
      inScope(row.group) &&
      matches(`${names[row.group as DiagramKind] ?? row.group} Keyboard shortcuts ${row.keys} ${row.action}`),
  );
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
        <div className="help-search">
          <label>
            Search Help
            <input
              data-dialog-autofocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Action, shortcut, or topic"
            />
          </label>
          <label>
            Show help for
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="current">{names[kind]} + General + Editing</option>
              <option value="all">All diagrams</option>
            </select>
          </label>
          <button
            onClick={() => {
              setQuery("");
              setScope("all");
            }}
          >
            All shortcuts & gestures
          </button>
          <p role="status">
            {sections.length} topics · {rows.length} shortcuts
          </p>
        </div>
        <div className="help-content">
          {!sections.length && !rows.length && (
            <p>No matching help. Try another action or shortcut, or choose All diagrams.</p>
          )}
          {groups.map((group) => {
            const groupTopics = sections.filter((topic) => topic.group === group);
            const groupRows = rows.filter((row) => row.group === group);
            if (!groupTopics.length && !groupRows.length) return null;
            return (
              <section key={group} aria-label={`${names[group as DiagramKind] ?? group} help`}>
                <h3>
                  {names[group as DiagramKind] ?? group}
                  {group === kind ? " · Current diagram" : ""}
                </h3>
                {groupTopics.map((topic) => {
                  const body = (
                    <>
                      {topic.paragraphs
                        .filter((paragraph) => !query.trim() || matches(topic.title) || matches(paragraph))
                        .map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      {topic.example && (!query.trim() || matches(topic.title) || matches(topic.example)) && (
                        <pre>{topic.example}</pre>
                      )}
                    </>
                  );
                  return topic.collapsible ? (
                    <details key={topic.title} open={query.trim() ? true : undefined}>
                      <summary>{topic.title}</summary>
                      {body}
                    </details>
                  ) : (
                    <div key={topic.title}>
                      <h4>{topic.title}</h4>
                      {body}
                    </div>
                  );
                })}
                {groupRows.length > 0 && (
                  <>
                    <h4>Keyboard shortcuts</h4>
                    <div className="shortcut-grid">
                      {groupRows.map((row) => (
                        <div key={row.action}>
                          <kbd>{row.keys}</kbd>
                          <span>{row.action}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            );
          })}
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
