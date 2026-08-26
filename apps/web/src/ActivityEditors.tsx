import { useEffect, useState } from "react";
import type {
  ActivityActionInput,
  ActivityArrow,
  ActivityArrowInput,
  ActivityControl,
  ActivityControlInput,
  ActivityDocument,
  ActivityNode,
  ActivityNote,
  ActivityNoteInput,
  ActivityPartition,
  ActivityPartitionInput,
  ActivityStructureInput,
} from "@plantuml-studio/diagram-activity";
import { ColorField } from "./ClassEditors";

export function AddActivityActionDialog({ document, onAdd, onClose }: { document: ActivityDocument; onAdd(value: ActivityActionInput): void; onClose(): void }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [stereotype, setStereotype] = useState("");
  const [partitionId, setPartitionId] = useState("");
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <form className="task-dialog" role="dialog" aria-label="Add Activity action" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ label, ...(color ? { color } : {}), ...(stereotype ? { stereotype } : {}), ...(partitionId ? { partitionId } : {}) }); }}>
      <h2>Add action</h2>
      <label>Text<input required autoFocus value={label} onChange={(event) => setLabel(event.target.value)} /></label>
      <label>Partition<select value={partitionId} onChange={(event) => setPartitionId(event.target.value)}><option value="">No partition</option>{document.partitions.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
      <label>Stereotype<input value={stereotype} onChange={(event) => setStereotype(event.target.value)} /></label>
      <ColorField value={color} onChange={setColor} />
      <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add action</button></div>
    </form>
  </div>;
}

export function AddActivityStructureDialog({ document, onAdd, onClose }: { document: ActivityDocument; onAdd(value: ActivityStructureInput): void; onClose(): void }) {
  const [kind, setKind] = useState<ActivityStructureInput["kind"]>("if");
  const [condition, setCondition] = useState("Condition?");
  const [actionLabel, setActionLabel] = useState("New action");
  const [partitionId, setPartitionId] = useState("");
  const needsCondition = kind === "if" || kind === "while" || kind === "repeat" || kind === "switch";
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity flow structure" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ kind, actionLabel, ...(needsCondition ? { condition } : {}), ...(partitionId ? { partitionId } : {}) }); }}><h2>Add flow structure</h2><label>Structure<select autoFocus value={kind} onChange={(event) => setKind(event.target.value as ActivityStructureInput["kind"])}><option value="if">Decision (if/else)</option><option value="while">While loop</option><option value="repeat">Repeat loop</option><option value="fork">Fork</option><option value="split">Split</option><option value="switch">Switch/case</option></select></label>{needsCondition && <label>Condition<input required value={condition} onChange={(event) => setCondition(event.target.value)} /></label>}<label>First action<input required value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} /></label><label>Partition<select value={partitionId} onChange={(event) => setPartitionId(event.target.value)}><option value="">No partition</option>{document.partitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p className="field-hint">A complete PlantUML block is added so the diagram remains valid.</p><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add structure</button></div></form></div>;
}

export function AddActivityTerminalDialog({ onAdd, onClose }: { onAdd(kind: "start" | "stop" | "end" | "detach" | "kill"): void; onClose(): void }) {
  const [kind, setKind] = useState<"start" | "stop" | "end" | "detach" | "kill">("stop");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity terminal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd(kind); }}><h2>Add terminal</h2><label>Terminal<select autoFocus value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="start">Start</option><option value="stop">Stop</option><option value="end">End</option><option value="detach">Detach</option><option value="kill">Kill</option></select></label><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add terminal</button></div></form></div>;
}

export function AddActivityArrowDialog({ document, onAdd, onClose }: { document: ActivityDocument; onAdd(value: ActivityArrowInput): void; onClose(): void }) {
  const targets = [...document.nodes, ...document.controls];
  const [targetId, setTargetId] = useState(targets.at(-1)?.id ?? "");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [lineStyle, setLineStyle] = useState<NonNullable<ActivityArrowInput["lineStyle"]>>("solid");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity flow arrow" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ targetId, lineStyle, ...(label ? { label } : {}), ...(color ? { color } : {}) }); }}><h2>Add flow arrow</h2><label>Place after<select required value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{"condition" in item ? item.condition || item.label || item.kind : item.label}</option>)}</select></label><label>Label<input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Line style<select value={lineStyle} onChange={(event) => setLineStyle(event.target.value as typeof lineStyle)}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="bold">Bold</option></select></label><ColorField value={color} onChange={setColor} /><p className="field-hint">PlantUML Activity arrows modify the next implicit flow; they do not have independent endpoints.</p><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add arrow</button></div></form></div>;
}

export function ActivityControlInspector({ item, onChange, onDelete, onClose }: { item: ActivityControl; onChange(value: ActivityControlInput): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityControlInput>({ ...(item.condition ? { condition: item.condition } : {}), ...(item.label ? { label: item.label } : {}) });
  useEffect(() => setValue({ ...(item.condition ? { condition: item.condition } : {}), ...(item.label ? { label: item.label } : {}) }), [item]);
  const conditionEditable = ["if", "elseif", "while", "repeat-while", "switch"].includes(item.kind);
  const labelEditable = ["if", "elseif", "else", "while", "repeat-while", "case", "endwhile"].includes(item.kind);
  const canDeleteBlock = ["if", "switch", "fork", "split", "repeat", "while"].includes(item.kind);
  return <aside className="task-inspector usecase-relationship-inspector" aria-label="Activity control inspector"><header><div><strong>Control inspector</strong><small>{item.kind.replaceAll("-", " ")}</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Control</legend><label>Type<input value={item.kind.replaceAll("-", " ")} disabled /></label>{conditionEditable && <label>Condition<input value={value.condition ?? ""} onChange={(event) => setValue({ ...value, condition: event.target.value })} onBlur={() => onChange(value)} /></label>}{labelEditable && <label>Branch label<input value={value.label ?? ""} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label>}</fieldset><p className="field-hint">Structural control types are preserved; editable text saves when you leave the field.</p>{canDeleteBlock && <div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete flow structure</button></div>}</form></aside>;
}

export function ActivityTerminalInspector({ item, onDelete, onClose }: { item: ActivityNode; onDelete(): void; onClose(): void }) {
  return <aside className="task-inspector usecase-element-inspector" aria-label="Activity terminal inspector"><header><div><strong>Terminal inspector</strong><small>{item.kind}</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Terminal</legend><label>Type<input value={item.kind} disabled /></label></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete terminal</button></div></form></aside>;
}

export function ActivityArrowInspector({ item, onChange, onDelete, onClose }: { item: ActivityArrow; onChange(value: ActivityArrowInput): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityArrowInput>({ ...(item.label ? { label: item.label } : {}), ...(item.color ? { color: item.color } : {}), ...(item.lineStyle ? { lineStyle: item.lineStyle } : { lineStyle: "solid" }) });
  useEffect(() => setValue({ ...(item.label ? { label: item.label } : {}), ...(item.color ? { color: item.color } : {}), ...(item.lineStyle ? { lineStyle: item.lineStyle } : { lineStyle: "solid" }) }), [item]);
  return <aside className="task-inspector usecase-relationship-inspector" aria-label="Activity arrow inspector"><header><div><strong>Flow arrow inspector</strong><small>Label and appearance</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Flow</legend><label>Label<input value={value.label ?? ""} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label><label>Line style<select value={value.lineStyle ?? "solid"} onChange={(event) => { const next = { ...value, lineStyle: event.target.value as NonNullable<ActivityArrowInput["lineStyle"]> }; setValue(next); onChange(next); }}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="bold">Bold</option></select></label></fieldset><fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete explicit arrow</button></div></form></aside>;
}

export function ActivityActionInspector({ item, document, onChange, onPartitionChange, onDelete, onClose }: { item: ActivityNode; document: ActivityDocument; onChange(value: ActivityActionInput): void; onPartitionChange(partitionId?: string): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityActionInput>({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.stereotype ? { stereotype: item.stereotype } : {}), ...(item.partitionId ? { partitionId: item.partitionId } : {}) });
  useEffect(() => setValue({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.stereotype ? { stereotype: item.stereotype } : {}), ...(item.partitionId ? { partitionId: item.partitionId } : {}) }), [item]);
  return <aside className="task-inspector usecase-element-inspector" aria-label="Activity action inspector">
    <header><div><strong>Action inspector</strong><small>Content and appearance</small></div><button onClick={onClose}>×</button></header>
    <form onSubmit={(event) => event.preventDefault()}>
      <fieldset><legend>Action</legend><label>Text<input value={value.label} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label><label>Partition<select value={value.partitionId ?? ""} onChange={(event) => { const partitionId = event.target.value || undefined; const { partitionId: _current, ...rest } = value; setValue({ ...rest, ...(partitionId ? { partitionId } : {}) }); onPartitionChange(partitionId); }}><option value="">No partition</option>{document.partitions.map((partition) => <option key={partition.id} value={partition.id}>{partition.label}</option>)}</select></label><label>Stereotype<input value={value.stereotype ?? ""} onChange={(event) => setValue({ ...value, stereotype: event.target.value })} onBlur={() => onChange(value)} /></label></fieldset>
      <fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset>
      <div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete action</button></div>
    </form>
  </aside>;
}

export function AddActivityPartitionDialog({ document, onAdd, onClose }: { document: ActivityDocument; onAdd(value: ActivityPartitionInput): void; onClose(): void }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [parentId, setParentId] = useState("");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity partition" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ label, ...(color ? { color } : {}), ...(parentId ? { parentId } : {}) }); }}><h2>Add partition</h2><label>Name<input required autoFocus value={label} onChange={(event) => setLabel(event.target.value)} /></label><label>Parent partition<select value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">No parent</option>{document.partitions.map((partition) => <option key={partition.id} value={partition.id}>{partition.label}</option>)}</select></label><ColorField value={color} onChange={setColor} /><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add partition</button></div></form></div>;
}

export function AddActivityNoteDialog({ document, onAdd, onClose }: { document: ActivityDocument; onAdd(value: ActivityNoteInput): void; onClose(): void }) {
  const [text, setText] = useState("");
  const [placement, setPlacement] = useState<ActivityNoteInput["placement"]>("right");
  const [color, setColor] = useState("");
  const [floating, setFloating] = useState(false);
  const targets = [...document.nodes.filter((item) => item.kind === "action"), ...document.controls];
  const [targetId, setTargetId] = useState(targets.at(-1)?.id ?? "");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity note" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ text, placement, ...(color ? { color } : {}), ...(floating ? { floating: true } : targetId ? { targetId } : {}) }); }}><h2>Add note</h2><label className="checkbox-row"><input type="checkbox" checked={floating} onChange={(event) => setFloating(event.target.checked)} />Floating note</label><label>Attached to<select disabled={floating} value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{"label" in item ? item.label : item.condition ?? item.kind}</option>)}</select></label><label>Position<select value={placement} onChange={(event) => setPlacement(event.target.value as ActivityNoteInput["placement"])}>{["left", "right", "top", "bottom"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Text<textarea required rows={6} value={text} onChange={(event) => setText(event.target.value)} /></label><ColorField value={color} onChange={setColor} /><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add note</button></div></form></div>;
}

export function ActivityPartitionInspector({ item, document, onChange, onParentChange, onDelete, onClose }: { item: ActivityPartition; document: ActivityDocument; onChange(value: ActivityPartitionInput): void; onParentChange(parentId?: string): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityPartitionInput>({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.parentId ? { parentId: item.parentId } : {}) });
  useEffect(() => setValue({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.parentId ? { parentId: item.parentId } : {}) }), [item]);
  const availableParents = document.partitions.filter((partition) => partition.id !== item.id && !(partition.sourceRange.from > item.sourceRange.from && partition.sourceRange.to < item.sourceRange.to));
  return <aside className="task-inspector usecase-package-inspector" aria-label="Activity partition inspector"><header><div><strong>Partition inspector</strong><small>Name and appearance</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Partition</legend><label>Name<input value={value.label} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label><label>Parent partition<select value={value.parentId ?? ""} onChange={(event) => onParentChange(event.target.value || undefined)}><option value="">No parent</option>{availableParents.map((partition) => <option key={partition.id} value={partition.id}>{partition.label}</option>)}</select></label></fieldset><fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete partition</button></div></form></aside>;
}

export function ActivityNoteInspector({ item, document, onChange, onDelete, onClose }: { item: ActivityNote; document: ActivityDocument; onChange(value: ActivityNoteInput): void; onDelete(): void; onClose(): void }) {
  const targets = [...document.nodes.filter((node) => node.kind === "action"), ...document.controls];
  const defaultTargetId = item.targetId ?? targets.at(-1)?.id;
  const [value, setValue] = useState<ActivityNoteInput>({ text: item.text, placement: item.placement, ...(item.color ? { color: item.color } : {}), ...(defaultTargetId ? { targetId: defaultTargetId } : {}), ...(item.floating ? { floating: true } : {}) });
  useEffect(() => setValue({ text: item.text, placement: item.placement, ...(item.color ? { color: item.color } : {}), ...(defaultTargetId ? { targetId: defaultTargetId } : {}), ...(item.floating ? { floating: true } : {}) }), [item, defaultTargetId]);
  return <aside className="task-inspector usecase-note-inspector" aria-label="Activity note inspector"><header><div><strong>Note inspector</strong><small>Content and appearance</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Placement</legend><label className="checkbox-row"><input type="checkbox" checked={value.floating ?? false} onChange={(event) => { const next = { ...value, floating: event.target.checked }; setValue(next); onChange(next); }} />Floating note</label><label>Attached to<select disabled={value.floating} value={value.targetId ?? ""} onChange={(event) => { const next = { ...value, targetId: event.target.value }; setValue(next); onChange(next); }}>{targets.map((target) => <option key={target.id} value={target.id}>{"condition" in target ? target.condition || target.label || target.kind : target.label}</option>)}</select></label><label>Position<select value={value.placement} onChange={(event) => { const next = { ...value, placement: event.target.value as ActivityNoteInput["placement"] }; setValue(next); onChange(next); }}>{["left", "right", "top", "bottom"].map((entry) => <option key={entry}>{entry}</option>)}</select></label></fieldset><fieldset><legend>Content</legend><label>Text<textarea rows={7} value={value.text} onChange={(event) => setValue({ ...value, text: event.target.value })} onBlur={() => onChange(value)} /></label></fieldset><fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete note</button></div></form></aside>;
}
