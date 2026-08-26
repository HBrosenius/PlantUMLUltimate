import type { ClassDocument, ClassEntity, ClassMember, ClassPackage, ClassRelationshipKind } from "./model";

const normalize = (v: string) => v.trim().replace(/^"|"$/g, "").toLowerCase();
const unquote = (v: string) => v.trim().replace(/^"(.*)"$/, "$1");
const member = (text: string): ClassMember => ({
  text: text.trim(),
  ...(/^([+\-#~])/.test(text.trim()) ? { visibility: text.trim()[0] as "+" | "-" | "#" | "~" } : {}),
  isStatic: /^\s*\{static\}/i.test(text),
  isAbstract: /^\s*\{abstract\}/i.test(text),
});
export function parseClassDiagram(source: string): ClassDocument {
  const entities: ClassEntity[] = [];
  const packages: ClassPackage[] = [];
  const relationships: ClassDocument["relationships"] = [];
  const notes: ClassDocument["notes"] = [];
  const unknown: ClassDocument["unknown"] = [];
  const diagnostics: ClassDocument["diagnostics"] = [];
  const aliases = new Map<string, string>();
  const stack: Array<{ item: ClassPackage; from: number }> = [];
  const lines: Array<{ text: string; from: number; to: number }> = [];
  let offset = 0;
  for (const text of source.split("\n")) {
    lines.push({ text, from: offset, to: offset + text.length });
    offset += text.length + 1;
  }
  const consumed = new Set<number>();
  let lastRelationshipId: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const note = line.text.match(
      /^\s*note\s+(left|right|top|bottom)\s+of\s+([^\s#]+)(?:\s+(#[\w]+))?\s*(?::\s*(.*))?$/i,
    );
    if (!note) continue;
    let end = i;
    let text = note[4] ?? "";
    if (!note[4]) {
      const body: string[] = [];
      end = i + 1;
      while (end < lines.length && !/^\s*end note\s*$/i.test(lines[end]!.text)) body.push(lines[end++]!.text);
      if (end >= lines.length) {
        diagnostics.push({
          severity: "error",
          message: "Note is missing end note",
          range: { from: line.from, to: line.to },
          code: "unterminated-note",
        });
        end = i;
      } else text = body.join("\n").trim();
    }
    for (let j = i; j <= end; j++) consumed.add(j);
    notes.push({
      id: `note-${notes.length}`,
      text,
      placement: note[1]!.toLowerCase() as "left" | "right" | "top" | "bottom",
      targetId: normalize(note[2]!),
      ...(note[3] ? { color: note[3] } : {}),
      sourceRange: { from: line.from, to: lines[end]!.to },
    });
    i = end;
  }
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i]!;
    const text = line.text.trim();
    const range = { from: line.from, to: line.to };
    const linkNote = line.text.match(/^\s*note\s+on\s+link(?:\s+(#[\w]+))?\s*(?::\s*(.*))?$/i);
    if (linkNote) {
      let end = i;
      let noteText = linkNote[2] ?? "";
      if (!linkNote[2]) {
        const body: string[] = [];
        end = i + 1;
        while (end < lines.length && !/^\s*end note\s*$/i.test(lines[end]!.text)) body.push(lines[end++]!.text);
        if (end >= lines.length) {
          diagnostics.push({
            severity: "error",
            message: "Link note is missing end note",
            range,
            code: "unterminated-note",
          });
          end = i;
        } else noteText = body.join("\n").trim();
      }
      notes.push({
        id: `note-${notes.length}`,
        text: noteText,
        ...(lastRelationshipId ? { targetId: lastRelationshipId } : {}),
        ...(linkNote[1] ? { color: linkNote[1] } : {}),
        sourceRange: { from: line.from, to: lines[end]!.to },
      });
      if (!lastRelationshipId)
        diagnostics.push({
          severity: "error",
          message: "Link note has no preceding relationship",
          range,
          code: "orphan-link-note",
        });
      i = end;
      continue;
    }
    if (
      !text ||
      text.startsWith("'") ||
      /^@(?:startuml|enduml)\b/i.test(text) ||
      /^(?:title|caption|header|footer|skinparam\b|hide\b|show\b|left to right direction|top to bottom direction)/i.test(
        text,
      )
    )
      continue;
    const pkg = line.text.match(
      /^\s*(package|namespace|folder|frame|node)\s+("[^"]+"|[^\s{#]+)(?:\s+as\s+([^\s{#]+))?(?:\s+(#[\w]+))?\s*\{\s*$/i,
    );
    if (pkg) {
      const label = unquote(pkg[2]!);
      const id = normalize(pkg[3] ?? label);
      const item: ClassPackage = {
        id,
        kind: pkg[1]!.toLowerCase() as ClassPackage["kind"],
        label,
        ...(pkg[3] ? { alias: pkg[3] } : {}),
        ...(pkg[4] ? { color: pkg[4] } : {}),
        ...(stack.at(-1) ? { parentId: stack.at(-1)!.item.id } : {}),
        sourceRange: range,
        openRange: range,
        closeRange: range,
      };
      packages.push(item);
      stack.push({ item, from: line.from });
      aliases.set(normalize(label), id);
      aliases.set(id, id);
      continue;
    }
    if (/^}\s*$/.test(text)) {
      const open = stack.pop();
      if (open) {
        open.item.closeRange = range;
        open.item.sourceRange = { from: open.from, to: line.to };
      } else
        diagnostics.push({
          severity: "error",
          message: "Unexpected closing brace",
          range,
          code: "unexpected-package-end",
        });
      continue;
    }
    const decl = line.text.match(
      /^\s*(abstract\s+class|abstract|class|interface|enum|annotation)\s+("[^"]+"|[^\s{#<]+)(?:\s+as\s+([^\s{#<]+))?(?:\s*<([^>{}]+)>)?(.*?)(\{)?\s*$/i,
    );
    if (decl) {
      const kind = (
        decl[1]!.toLowerCase().startsWith("abstract") ? "abstract" : decl[1]!.toLowerCase()
      ) as ClassEntity["kind"];
      const label = unquote(decl[2]!);
      const id = normalize(decl[3] ?? label);
      const rest = decl[5] ?? "";
      const stereotype = rest.match(/<<\s*(.*?)\s*>>/)?.[1];
      const color = rest.match(/#[\w]+/)?.[0];
      let end = i;
      const members: ClassMember[] = [];
      const inlineMembers = line.text.match(/\{\s*(.*?)\s*}\s*$/)?.[1];
      if (inlineMembers !== undefined) {
        members.push(
          ...inlineMembers
            .split(";")
            .map((value) => value.trim())
            .filter(Boolean)
            .map(member),
        );
      } else if (decl[6]) {
        end = i + 1;
        while (end < lines.length && !/^\s*}\s*$/.test(lines[end]!.text)) members.push(member(lines[end++]!.text));
        if (end >= lines.length) {
          diagnostics.push({ severity: "error", message: `${label} is missing }`, range, code: "unterminated-class" });
          end = i;
        } else for (let j = i + 1; j <= end; j++) consumed.add(j);
      }
      const item: ClassEntity = {
        id,
        kind,
        label,
        ...(decl[3] ? { alias: decl[3] } : {}),
        ...(decl[4] ? { generic: decl[4] } : {}),
        ...(stereotype ? { stereotype } : {}),
        ...(color ? { color } : {}),
        members,
        ...(stack.at(-1) ? { packageId: stack.at(-1)!.item.id } : {}),
        sourceRange: { from: line.from, to: lines[end]!.to },
        openRange: range,
      };
      entities.push(item);
      aliases.set(normalize(label), id);
      aliases.set(id, id);
      i = end;
      continue;
    }
    const rel = line.text.match(
      /^\s*("[^"]+"|[\w.$-]+)(?:\s+"([^"]+)")?\s+([^\s]+)\s+(?:"([^"]+)"\s+)?("[^"]+"|[\w.$-]+)(?:\s*:\s*(.*))?$/,
    );
    if (rel && /[-.]/.test(rel[3]!)) {
      const arrow = rel[3]!;
      const modifiers =
        arrow
          .match(/\[([^\]]+)\]/)?.[1]
          ?.split(",")
          .map((value) => value.trim()) ?? [];
      const color = modifiers.find((value) => value.startsWith("#"));
      const lineStyle = modifiers.find((value) => ["dashed", "dotted", "bold"].includes(value)) as
        "dashed" | "dotted" | "bold" | undefined;
      const kind: ClassRelationshipKind =
        arrow.includes("<|") || arrow.includes("|>")
          ? arrow.includes(".")
            ? "implementation"
            : "inheritance"
          : arrow.includes("*")
            ? "composition"
            : arrow.includes("o")
              ? "aggregation"
              : arrow.includes(".")
                ? "dependency"
                : "association";
      const relationshipId = `relationship-${relationships.length}`;
      relationships.push({
        id: relationshipId,
        from: aliases.get(normalize(rel[1]!)) ?? normalize(rel[1]!),
        to: aliases.get(normalize(rel[5]!)) ?? normalize(rel[5]!),
        arrow,
        kind,
        ...(rel[2] ? { fromMultiplicity: rel[2] } : {}),
        ...(rel[4] ? { toMultiplicity: rel[4] } : {}),
        ...(rel[6]?.trim() ? { label: rel[6].trim() } : {}),
        ...(color ? { color } : {}),
        ...(lineStyle ? { lineStyle } : {}),
        sourceRange: range,
      });
      lastRelationshipId = relationshipId;
      continue;
    }
    unknown.push({ text: line.text, range });
  }
  for (const open of stack)
    diagnostics.push({
      severity: "error",
      message: `Package ${open.item.label} is missing }`,
      range: open.item.openRange,
      code: "unterminated-package",
    });
  const declarations = [...entities, ...packages];
  const ids = new Set(entities.map((x) => x.id));
  for (const declaration of declarations) {
    if (declarations.filter((item) => item.id === declaration.id).length > 1)
      diagnostics.push({
        severity: "error",
        message: `Duplicate alias: ${declaration.alias ?? declaration.label}`,
        range: declaration.sourceRange,
        code: "duplicate-alias",
      });
  }
  for (const r of relationships) {
    if (!ids.has(r.from) || !ids.has(r.to))
      diagnostics.push({
        severity: "error",
        message: "Unknown relationship endpoint",
        range: r.sourceRange,
        code: "unknown-endpoint",
      });
  }
  const noteTargets = new Set([...ids, ...relationships.map((item) => item.id)]);
  for (const note of notes)
    if (note.targetId && !noteTargets.has(note.targetId))
      diagnostics.push({
        severity: "error",
        message: "Unknown note target",
        range: note.sourceRange,
        code: "unknown-note-target",
      });
  return {
    entities,
    packages,
    relationships,
    notes,
    stereotypes: [...new Set(entities.flatMap((x) => (x.stereotype ? [x.stereotype] : [])))],
    unknown,
    diagnostics,
  };
}
export const findClassObjectAt = (d: ClassDocument, p: number) =>
  [...d.entities, ...d.packages, ...d.relationships, ...d.notes]
    .filter((x) => p >= x.sourceRange.from && p <= x.sourceRange.to)
    .sort((a, b) => a.sourceRange.to - a.sourceRange.from - (b.sourceRange.to - b.sourceRange.from))[0];
