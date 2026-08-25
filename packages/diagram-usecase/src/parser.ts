import type { LanguageDiagnostic, TextRange } from "@plantuml-studio/language-core";
import type {
  UseCaseDocument,
  UseCaseElement,
  UseCaseNote,
  UseCasePackage,
  UseCaseRelationship,
  UseCaseRelationshipKind,
} from "./model";

const normalizeId = (value: string) =>
  value
    .trim()
    .replace(/^[:(]|[:)]$/g, "")
    .replace(/^"|"$/g, "")
    .toLowerCase();
const unquote = (value: string) => value.trim().replace(/^"([\s\S]*)"$/, "$1");
const details = (value: string) => {
  const stereotype = value.match(/<<\s*(.*?)\s*>>/)?.[1];
  const color = value.match(/(?:^|\s)(#[\w]+)(?=\s|$)/)?.[1];
  const style = value.match(/(#[^\s]+(?:;[^\s]+)*)/)?.[1];
  return {
    ...(stereotype ? { stereotype } : {}),
    ...(color ? { color } : {}),
    ...(style ? { style } : {}),
  };
};

function endpointId(value: string, aliases: ReadonlyMap<string, string>): string {
  const normalized = normalizeId(value);
  return aliases.get(normalized) ?? normalized;
}

export function parseUseCase(source: string): UseCaseDocument {
  const elements: UseCaseElement[] = [];
  const packages: UseCasePackage[] = [];
  const relationships: UseCaseRelationship[] = [];
  const notes: UseCaseNote[] = [];
  const unknown: UseCaseDocument["unknown"] = [];
  const diagnostics: LanguageDiagnostic[] = [];
  const aliases = new Map<string, string>();
  const packageStack: Array<{ value: UseCasePackage; from: number }> = [];
  const noteRanges: TextRange[] = [];
  const lines: Array<{ text: string; from: number; to: number }> = [];
  let offset = 0;
  for (const text of source.split("\n")) {
    lines.push({ text, from: offset, to: offset + text.length });
    offset += text.length + 1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const attached = line.text.match(
      /^\s*note\s+(left|right|top|bottom)\s+of\s+([^\s#]+)(?:\s+(#[\w]+))?\s*(?::\s*(.*))?$/i,
    );
    const floating = line.text.match(/^\s*note\s+"([^"]*)"\s+as\s+([^\s#]+)(?:\s+(#[\w]+))?\s*$/i);
    const floatingBlock = line.text.match(/^\s*note\s+as\s+([^\s#]+)(?:\s+(#[\w]+))?\s*$/i);
    if (!attached && !floating && !floatingBlock) continue;
    let end = index;
    let text = attached?.[4] ?? floating?.[1] ?? "";
    if ((attached && !attached[4]) || floatingBlock) {
      const body: string[] = [];
      end = index + 1;
      while (end < lines.length && !/^\s*end\s+note\s*$/i.test(lines[end]!.text)) body.push(lines[end++]!.text);
      if (end >= lines.length) {
        diagnostics.push({
          severity: "error",
          message: "Note is missing end note",
          range: { from: line.from, to: line.to },
          code: "unterminated-note",
        });
        end = index;
      } else text = body.join("\n").trim();
    }
    const range = { from: line.from, to: lines[end]!.to };
    const noteColor = attached?.[3] ?? floating?.[3] ?? floatingBlock?.[2];
    const noteAlias = floating?.[2] ?? floatingBlock?.[1];
    notes.push({
      id: `note-${notes.length}`,
      text,
      ...(attached?.[1] ? { placement: attached[1].toLowerCase() as NonNullable<UseCaseNote["placement"]> } : {}),
      targetIds: attached?.[2] ? [normalizeId(attached[2])] : [],
      ...(noteAlias ? { alias: noteAlias } : {}),
      ...(noteColor ? { color: noteColor } : {}),
      sourceRange: range,
    });
    noteRanges.push(range);
    index = end;
  }

  for (const line of lines) {
    if (noteRanges.some((range) => line.from >= range.from && line.from <= range.to)) continue;
    const text = line.text.trim();
    const range = { from: line.from, to: line.to };
    if (!text || text.startsWith("'") || /^@(?:startuml|enduml)\b/i.test(text)) continue;
    if (
      /^(?:title|caption|header|footer|legend|endlegend|left to right direction|top to bottom direction|skinparam\b|allowmixing\b)/i.test(
        text,
      )
    )
      continue;

    const packageMatch = line.text.match(
      /^\s*(package|rectangle)\s+("[^"]+"|[^\s{#<]+)(?:\s+as\s+([^\s{#<]+))?(.*)\{\s*$/i,
    );
    if (packageMatch?.[1] && packageMatch[2]) {
      const label = unquote(packageMatch[2]);
      const id = normalizeId(packageMatch[3] ?? label);
      const metadata = details(packageMatch[4] ?? "");
      const value: UseCasePackage = {
        id,
        kind: packageMatch[1].toLowerCase() as UseCasePackage["kind"],
        label,
        ...(packageMatch[3] ? { alias: packageMatch[3] } : {}),
        ...metadata,
        ...(packageStack.at(-1) ? { parentId: packageStack.at(-1)!.value.id } : {}),
        sourceRange: range,
        openRange: range,
        closeRange: range,
      };
      packages.push(value);
      packageStack.push({ value, from: line.from });
      aliases.set(normalizeId(label), id);
      aliases.set(id, id);
      continue;
    }
    if (/^}\s*$/.test(text)) {
      const open = packageStack.pop();
      if (!open)
        diagnostics.push({
          severity: "error",
          message: "Unexpected package closing brace",
          range,
          code: "unexpected-package-end",
        });
      else {
        open.value.closeRange = range;
        open.value.sourceRange = { from: open.from, to: line.to };
      }
      continue;
    }

    const actor = line.text.match(
      /^\s*(?:(actor)(\/)?\s+("[^"]+"|:[^:]+:|[^\s#<]+)|(:[^:]+:)(\/)?)(?:\s+as\s+([^\s#<]+))?(.*)$/i,
    );
    if (actor) {
      const token = actor[3] ?? actor[4] ?? "";
      const label = unquote(token.replace(/^:|:$/g, ""));
      const alias = actor[6];
      const id = normalizeId(alias ?? label);
      const metadata = details(actor[7] ?? "");
      elements.push({
        id,
        kind: "actor",
        label,
        ...(alias ? { alias } : {}),
        business: Boolean(actor[2] ?? actor[5]),
        ...metadata,
        ...(packageStack.at(-1) ? { packageId: packageStack.at(-1)!.value.id } : {}),
        sourceRange: range,
      });
      aliases.set(normalizeId(label), id);
      aliases.set(id, id);
      continue;
    }

    const useCase = line.text.match(
      /^\s*(?:(usecase)(\/)?\s+("[^"]+"|\([^)]*\)|[^\s#<]+)|(\([^)]*\))(\/)?)(?:\s+as\s+("[^"]+"|\([^)]*\)|[^\s#<]+))?(.*)$/i,
    );
    if (useCase) {
      const token = useCase[3] ?? useCase[4] ?? "";
      const label = unquote(token.replace(/^\(|\)$/g, ""));
      const aliasToken = useCase[6];
      const alias = aliasToken ? unquote(aliasToken.replace(/^\(|\)$/g, "")) : undefined;
      const id = normalizeId(alias ?? label);
      const metadata = details(useCase[7] ?? "");
      elements.push({
        id,
        kind: "usecase",
        label,
        ...(alias ? { alias } : {}),
        business: Boolean(useCase[2] ?? useCase[5]),
        ...metadata,
        ...(packageStack.at(-1) ? { packageId: packageStack.at(-1)!.value.id } : {}),
        sourceRange: range,
      });
      aliases.set(normalizeId(label), id);
      aliases.set(id, id);
      continue;
    }

    const relation = line.text.match(
      /^\s*("[^"]+"|:[^:]+:|\([^)]*\)|[\w.$-]+)\s+([^\s]+)\s+("[^"]+"|:[^:]+:|\([^)]*\)|[\w.$-]+)(?:\s*:\s*(.*))?$/,
    );
    if (relation?.[1] && relation[2] && relation[3] && /[-.]/.test(relation[2])) {
      const label = relation[4]?.trim();
      const stereotype = label?.match(/^<<\s*(include|extend)\s*>>$/i)?.[1]?.toLowerCase();
      const kind: UseCaseRelationshipKind =
        stereotype === "include" || stereotype === "extend"
          ? stereotype
          : relation[2].includes("|>") || relation[2].includes("<|")
            ? "generalization"
            : "association";
      const style = relation[2]
        .match(/(?:line\.|[,[])(bold|dashed|dotted)/i)?.[1]
        ?.toLowerCase() as UseCaseRelationship["lineStyle"];
      const direction = relation[2]
        .match(/(?:left|right|up|down)/i)?.[0]
        ?.toLowerCase() as UseCaseRelationship["direction"];
      const color = relation[2].match(/#[\w]+/)?.[0];
      relationships.push({
        id: `relationship-${relationships.length}`,
        from: endpointId(relation[1], aliases),
        to: endpointId(relation[3], aliases),
        arrow: relation[2],
        kind,
        ...(label ? { label } : {}),
        ...(style ? { lineStyle: style } : {}),
        ...(direction ? { direction } : {}),
        ...(color ? { color } : {}),
        sourceRange: range,
      });
      continue;
    }
    unknown.push({ text: line.text, range });
  }

  for (const open of packageStack)
    diagnostics.push({
      severity: "error",
      message: `Package ${open.value.label} is missing }`,
      range: open.value.openRange,
      code: "unterminated-package",
    });
  const ids = new Set<string>();
  for (const element of elements) {
    if (ids.has(element.id))
      diagnostics.push({
        severity: "error",
        message: `Duplicate alias: ${element.alias ?? element.label}`,
        range: element.sourceRange,
        code: "duplicate-alias",
      });
    ids.add(element.id);
  }
  for (const relationship of relationships) {
    if (!ids.has(relationship.from))
      diagnostics.push({
        severity: "error",
        message: `Unknown relationship endpoint: ${relationship.from}`,
        range: relationship.sourceRange,
        code: "unknown-endpoint",
      });
    if (!ids.has(relationship.to))
      diagnostics.push({
        severity: "error",
        message: `Unknown relationship endpoint: ${relationship.to}`,
        range: relationship.sourceRange,
        code: "unknown-endpoint",
      });
  }
  const stereotypes = [...new Set(elements.flatMap((item) => (item.stereotype ? [item.stereotype] : [])))];
  return {
    elements,
    actors: elements.filter((item) => item.kind === "actor"),
    useCases: elements.filter((item) => item.kind === "usecase"),
    packages,
    relationships,
    notes,
    stereotypes,
    unknown,
    diagnostics,
  };
}

export function findUseCaseObjectAt(document: UseCaseDocument, position: number) {
  return [...document.elements, ...document.packages, ...document.relationships, ...document.notes].find(
    (item) => position >= item.sourceRange.from && position <= item.sourceRange.to,
  );
}
