import type {
  ClassDocument,
  ClassEntity,
  ClassEntityKind,
  ClassPackage,
  ClassNote,
  ClassRelationship,
  ClassRelationshipKind,
} from "./model";
export interface ClassEntityInput {
  kind: ClassEntityKind;
  label: string;
  alias?: string;
  generic?: string;
  stereotype?: string;
  color?: string;
  members: string[];
}
export interface ClassPackageInput {
  kind: ClassPackage["kind"];
  label: string;
  alias?: string;
  color?: string;
}
export interface ClassRelationshipInput {
  from: string;
  to: string;
  kind: ClassRelationshipKind;
  label?: string;
  fromMultiplicity?: string;
  toMultiplicity?: string;
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted" | "bold";
}
export interface ClassNoteInput {
  text: string;
  placement: "left" | "right" | "top" | "bottom";
  targetId: string;
  color?: string;
}
const quote = (v: string) => `"${v.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const ref = (d: ClassDocument, id: string) => {
  const x = d.entities.find((e) => e.id === id);
  return x?.alias ?? x?.label ?? id;
};
const point = (s: string) => {
  const m = /(?:^|\n)\s*@enduml\b/i.exec(s);
  return m ? m.index + (m[0].startsWith("\n") ? 1 : 0) : s.length;
};
const entityLine = (v: ClassEntityInput) =>
  `${v.kind === "abstract" ? "abstract class" : v.kind} ${quote(v.label.trim())}${v.alias?.trim() ? ` as ${v.alias.trim()}` : ""}${v.generic?.trim() ? `<${v.generic.trim()}>` : ""}${v.stereotype?.trim() ? ` <<${v.stereotype.trim()}>>` : ""}${v.color?.trim() ? ` ${v.color.startsWith("#") ? v.color : `#${v.color}`}` : ""}${v.members.length ? ` {\n${v.members.map((x) => `  ${x.trim()}`).join("\n")}\n}` : ""}`;
const arrow = (v: ClassRelationshipInput) => {
  const color = v.color?.trim();
  const style = [
    color ? (color.startsWith("#") ? color : `#${color}`) : undefined,
    v.lineStyle && v.lineStyle !== "solid" ? v.lineStyle : undefined,
  ].filter(Boolean);
  const mod = style.length ? `[${style.join(",")}]` : "";
  if (v.kind === "inheritance") return `-${mod}-|>`;
  if (v.kind === "implementation") return `.${mod}.|>`;
  if (v.kind === "composition") return `*-${mod}->`;
  if (v.kind === "aggregation") return `o-${mod}->`;
  if (v.kind === "dependency") return `.${mod}.>`;
  return `-${mod}->`;
};
const relationLine = (d: ClassDocument, v: ClassRelationshipInput) =>
  `${ref(d, v.from)}${v.fromMultiplicity ? ` "${v.fromMultiplicity}"` : ""} ${arrow(v)} ${v.toMultiplicity ? `"${v.toMultiplicity}" ` : ""}${ref(d, v.to)}${v.label?.trim() ? ` : ${v.label.trim()}` : ""}`;
const replace = (s: string, r: { from: number; to: number; text: string }[]) =>
  r.sort((a, b) => b.from - a.from).reduce((c, x) => c.slice(0, x.from) + x.text + c.slice(x.to), s);
const insert = (s: string, text: string) => {
  const at = point(s);
  return s.slice(0, at) + (at && s[at - 1] !== "\n" ? "\n" : "") + text + "\n" + s.slice(at);
};
export const insertClassEntity = (s: string, v: ClassEntityInput) => insert(s, entityLine(v));
export function updateClassEntity(s: string, d: ClassDocument, e: ClassEntity, v: ClassEntityInput) {
  const next = v.alias?.trim() || v.label.trim();
  const reps = [{ ...e.sourceRange, text: entityLine(v) }];
  for (const r of d.relationships) {
    if (r.from !== e.id && r.to !== e.id) continue;
    const input: ClassRelationshipInput = {
      from: r.from === e.id ? next : r.from,
      to: r.to === e.id ? next : r.to,
      kind: r.kind,
      ...(r.label ? { label: r.label } : {}),
      ...(r.fromMultiplicity ? { fromMultiplicity: r.fromMultiplicity } : {}),
      ...(r.toMultiplicity ? { toMultiplicity: r.toMultiplicity } : {}),
      ...(r.color ? { color: r.color } : {}),
      ...(r.lineStyle ? { lineStyle: r.lineStyle } : {}),
    };
    reps.push({ ...r.sourceRange, text: relationLine(d, input) });
  }
  return replace(s, reps);
}
export function deleteClassEntity(s: string, d: ClassDocument, e: ClassEntity) {
  const ranges = [
    e.sourceRange,
    ...d.relationships.filter((r) => r.from === e.id || r.to === e.id).map((r) => r.sourceRange),
    ...d.notes.filter((n) => n.targetId === e.id).map((n) => n.sourceRange),
  ];
  return replace(
    s,
    ranges.map((x) => ({ from: x.from, to: s[x.to] === "\n" ? x.to + 1 : x.to, text: "" })),
  );
}
export const insertClassRelationship = (s: string, d: ClassDocument, v: ClassRelationshipInput) =>
  insert(s, relationLine(d, v));
export const updateClassRelationship = (s: string, d: ClassDocument, r: ClassRelationship, v: ClassRelationshipInput) =>
  replace(s, [{ ...r.sourceRange, text: relationLine(d, v) }]);
export const deleteClassRelationship = (s: string, r: ClassRelationship) =>
  replace(s, [
    { from: r.sourceRange.from, to: s[r.sourceRange.to] === "\n" ? r.sourceRange.to + 1 : r.sourceRange.to, text: "" },
  ]);
export const insertClassPackage = (s: string, v: ClassPackageInput) =>
  insert(
    s,
    `${v.kind} ${quote(v.label)}${v.alias ? ` as ${v.alias}` : ""}${v.color ? ` ${v.color.startsWith("#") ? v.color : `#${v.color}`}` : ""} {\n}`,
  );
export const updateClassPackage = (s: string, p: ClassPackage, v: ClassPackageInput) =>
  replace(s, [
    {
      ...p.openRange,
      text: `${v.kind} ${quote(v.label)}${v.alias ? ` as ${v.alias}` : ""}${v.color ? ` ${v.color.startsWith("#") ? v.color : `#${v.color}`}` : ""} {`,
    },
  ]);
export const deleteClassPackage = (s: string, p: ClassPackage) =>
  replace(
    s,
    [p.closeRange, p.openRange].map((x) => ({ from: x.from, to: s[x.to] === "\n" ? x.to + 1 : x.to, text: "" })),
  );
export function moveClassEntityToPackage(s: string, d: ClassDocument, e: ClassEntity, packageId?: string) {
  if (e.packageId === packageId) return s;
  const target = packageId ? d.packages.find((x) => x.id === packageId) : undefined;
  if (packageId && !target) return s;
  const from = e.sourceRange.from,
    to = s[e.sourceRange.to] === "\n" ? e.sourceRange.to + 1 : e.sourceRange.to,
    text = s.slice(e.sourceRange.from, e.sourceRange.to).trim(),
    without = s.slice(0, from) + s.slice(to),
    original = target?.closeRange.from ?? point(s),
    at = original > to ? original - (to - from) : original;
  return without.slice(0, at) + text + "\n" + without.slice(at);
}
export function reorderClassEntity(s: string, e: ClassEntity, target: ClassEntity, placement: "before" | "after") {
  if (e.id === target.id || e.packageId !== target.packageId) return s;
  const from = e.sourceRange.from,
    to = s[e.sourceRange.to] === "\n" ? e.sourceRange.to + 1 : e.sourceRange.to,
    text = s.slice(from, e.sourceRange.to).trim(),
    targetAt =
      placement === "before"
        ? target.sourceRange.from
        : target.sourceRange.to + (s[target.sourceRange.to] === "\n" ? 1 : 0),
    without = s.slice(0, from) + s.slice(to),
    at = targetAt > to ? targetAt - (to - from) : targetAt;
  return without.slice(0, at) + text + "\n" + without.slice(at);
}
const noteLine = (d: ClassDocument, v: ClassNoteInput) => {
  const color = v.color?.trim(),
    prefix = `note ${v.placement} of ${ref(d, v.targetId)}${color ? ` ${color.startsWith("#") ? color : `#${color}`}` : ""}`;
  return v.text.includes("\n") ? `${prefix}\n${v.text.trim()}\nend note` : `${prefix} : ${v.text.trim()}`;
};
export const insertClassNote = (s: string, d: ClassDocument, v: ClassNoteInput) => insert(s, noteLine(d, v));
export const updateClassNote = (s: string, d: ClassDocument, n: ClassNote, v: ClassNoteInput) =>
  replace(s, [{ ...n.sourceRange, text: noteLine(d, v) }]);
export const deleteClassNote = (s: string, n: ClassNote) =>
  replace(s, [
    { from: n.sourceRange.from, to: s[n.sourceRange.to] === "\n" ? n.sourceRange.to + 1 : n.sourceRange.to, text: "" },
  ]);
