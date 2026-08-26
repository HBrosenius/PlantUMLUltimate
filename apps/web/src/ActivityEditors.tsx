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

export function ActivityControlInspector({ item, onChange, onClose }: { item: ActivityControl; onChange(value: ActivityControlInput): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityControlInput>({ ...(item.condition ? { condition: item.condition } : {}), ...(item.label ? { label: item.label } : {}) });
  useEffect(() => setValue({ ...(item.condition ? { condition: item.condition } : {}), ...(item.label ? { label: item.label } : {}) }), [item]);
  const conditionEditable = ["if", "elseif", "while", "repeat-while", "switch"].includes(item.kind);
  const labelEditable = ["if", "elseif", "else", "while", "repeat-while", "case", "endwhile"].includes(item.kind);
  return <aside className="task-inspector usecase-relationship-inspector" aria-label="Activity control inspector"><header><div><strong>Control inspector</strong><small>{item.kind.replaceAll("-", " ")}</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Control</legend><label>Type<input value={item.kind.replaceAll("-", " ")} disabled /></label>{conditionEditable && <label>Condition<input value={value.condition ?? ""} onChange={(event) => setValue({ ...value, condition: event.target.value })} onBlur={() => onChange(value)} /></label>}{labelEditable && <label>Branch label<input value={value.label ?? ""} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label>}</fieldset><p className="field-hint">Structural control types are preserved; editable text saves when you leave the field.</p></form></aside>;
}

export function ActivityArrowInspector({ item, onChange, onDelete, onClose }: { item: ActivityArrow; onChange(value: ActivityArrowInput): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityArrowInput>({ ...(item.label ? { label: item.label } : {}), ...(item.color ? { color: item.color } : {}), ...(item.lineStyle ? { lineStyle: item.lineStyle } : { lineStyle: "solid" }) });
  useEffect(() => setValue({ ...(item.label ? { label: item.label } : {}), ...(item.color ? { color: item.color } : {}), ...(item.lineStyle ? { lineStyle: item.lineStyle } : { lineStyle: "solid" }) }), [item]);
  return <aside className="task-inspector usecase-relationship-inspector" aria-label="Activity arrow inspector"><header><div><strong>Flow arrow inspector</strong><small>Label and appearance</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Flow</legend><label>Label<input value={value.label ?? ""} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label><label>Line style<select value={value.lineStyle ?? "solid"} onChange={(event) => { const next = { ...value, lineStyle: event.target.value as NonNullable<ActivityArrowInput["lineStyle"]> }; setValue(next); onChange(next); }}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="bold">Bold</option></select></label></fieldset><fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete explicit arrow</button></div></form></aside>;
}

export function ActivityActionInspector({ item, onChange, onDelete, onClose }: { item: ActivityNode; onChange(value: ActivityActionInput): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityActionInput>({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.stereotype ? { stereotype: item.stereotype } : {}), ...(item.partitionId ? { partitionId: item.partitionId } : {}) });
  useEffect(() => setValue({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.stereotype ? { stereotype: item.stereotype } : {}), ...(item.partitionId ? { partitionId: item.partitionId } : {}) }), [item]);
  return <aside className="task-inspector usecase-element-inspector" aria-label="Activity action inspector">
    <header><div><strong>Action inspector</strong><small>Content and appearance</small></div><button onClick={onClose}>×</button></header>
    <form onSubmit={(event) => event.preventDefault()}>
      <fieldset><legend>Action</legend><label>Text<input value={value.label} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label><label>Stereotype<input value={value.stereotype ?? ""} onChange={(event) => setValue({ ...value, stereotype: event.target.value })} onBlur={() => onChange(value)} /></label></fieldset>
      <fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset>
      <div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete action</button></div>
    </form>
  </aside>;
}

export function AddActivityPartitionDialog({ onAdd, onClose }: { onAdd(value: ActivityPartitionInput): void; onClose(): void }) {
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity partition" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ label, ...(color ? { color } : {}) }); }}><h2>Add partition</h2><label>Name<input required autoFocus value={label} onChange={(event) => setLabel(event.target.value)} /></label><ColorField value={color} onChange={setColor} /><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add partition</button></div></form></div>;
}

export function AddActivityNoteDialog({ document, onAdd, onClose }: { document: ActivityDocument; onAdd(value: ActivityNoteInput): void; onClose(): void }) {
  const [text, setText] = useState("");
  const [placement, setPlacement] = useState<ActivityNoteInput["placement"]>("right");
  const [color, setColor] = useState("");
  const targets = [...document.nodes.filter((item) => item.kind === "action"), ...document.controls];
  const [targetId, setTargetId] = useState(targets.at(-1)?.id ?? "");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="task-dialog" role="dialog" aria-label="Add Activity note" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onAdd({ text, placement, ...(color ? { color } : {}), ...(targetId ? { targetId } : {}) }); }}><h2>Add note</h2><label>Attached to<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{"label" in item ? item.label : item.condition ?? item.kind}</option>)}</select></label><label>Position<select value={placement} onChange={(event) => setPlacement(event.target.value as ActivityNoteInput["placement"])}>{["left", "right", "top", "bottom"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Text<textarea required rows={6} value={text} onChange={(event) => setText(event.target.value)} /></label><ColorField value={color} onChange={setColor} /><div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary">Add note</button></div></form></div>;
}

export function ActivityPartitionInspector({ item, onChange, onDelete, onClose }: { item: ActivityPartition; onChange(value: ActivityPartitionInput): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityPartitionInput>({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.parentId ? { parentId: item.parentId } : {}) });
  useEffect(() => setValue({ label: item.label, ...(item.color ? { color: item.color } : {}), ...(item.parentId ? { parentId: item.parentId } : {}) }), [item]);
  return <aside className="task-inspector usecase-package-inspector" aria-label="Activity partition inspector"><header><div><strong>Partition inspector</strong><small>Name and appearance</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Partition</legend><label>Name<input value={value.label} onChange={(event) => setValue({ ...value, label: event.target.value })} onBlur={() => onChange(value)} /></label></fieldset><fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete partition</button></div></form></aside>;
}

export function ActivityNoteInspector({ item, onChange, onDelete, onClose }: { item: ActivityNote; onChange(value: ActivityNoteInput): void; onDelete(): void; onClose(): void }) {
  const [value, setValue] = useState<ActivityNoteInput>({ text: item.text, placement: item.placement, ...(item.color ? { color: item.color } : {}) });
  useEffect(() => setValue({ text: item.text, placement: item.placement, ...(item.color ? { color: item.color } : {}) }), [item]);
  return <aside className="task-inspector usecase-note-inspector" aria-label="Activity note inspector"><header><div><strong>Note inspector</strong><small>Content and appearance</small></div><button onClick={onClose}>×</button></header><form onSubmit={(event) => event.preventDefault()}><fieldset><legend>Placement</legend><label>Position<select value={value.placement} onChange={(event) => { const next = { ...value, placement: event.target.value as ActivityNoteInput["placement"] }; setValue(next); onChange(next); }}>{["left", "right", "top", "bottom"].map((entry) => <option key={entry}>{entry}</option>)}</select></label></fieldset><fieldset><legend>Content</legend><label>Text<textarea rows={7} value={value.text} onChange={(event) => setValue({ ...value, text: event.target.value })} onBlur={() => onChange(value)} /></label></fieldset><fieldset><legend>Appearance</legend><ColorField value={value.color ?? ""} onChange={(color) => setValue({ ...value, color })} onBlur={() => onChange(value)} /></fieldset><div className="inspector-actions"><button type="button" className="danger" onClick={onDelete}>Delete note</button></div></form></aside>;
}
