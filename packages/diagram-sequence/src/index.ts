export type SequenceParticipantKind =
  "participant" | "actor" | "boundary" | "control" | "entity" | "database" | "collections" | "queue";

export interface SequenceParticipant {
  id: string;
  kind: SequenceParticipantKind;
  label: string;
  alias?: string;
  color?: string;
  stereotype?: string;
  spotCharacter?: string;
  spotColor?: string;
  order?: number;
  sourceRange: { from: number; to: number };
}

export interface SequenceMessage {
  id: string;
  from: string;
  to: string;
  arrow: string;
  label: string;
  modifiers?: string;
  anchor?: string;
  sourceRange: { from: number; to: number };
}
export interface SequenceDuration {
  id: string;
  fromAnchor: string;
  toAnchor: string;
  arrow: string;
  label: string;
  sourceRange: { from: number; to: number };
}

export type SequenceFragmentKind = "alt" | "opt" | "loop" | "par" | "break" | "critical" | "group";
export interface SequenceFragment {
  id: string;
  kind: SequenceFragmentKind;
  label: string;
  secondaryLabel?: string;
  headerColor?: string;
  backgroundColor?: string;
  branches: Array<{ label: string; color?: string }>;
  sourceRange: { from: number; to: number };
}
export interface SequenceActivation {
  id: string;
  kind: "activate" | "deactivate" | "destroy";
  participant: string;
  color?: string;
  sourceRange: { from: number; to: number };
}
export interface SequenceNote {
  id: string;
  placement: "left" | "right" | "over" | "across" | "left of" | "right of";
  participants: string[];
  text: string;
  color?: string;
  shape: "note" | "hnote" | "rnote";
  aligned: boolean;
  sourceRange: { from: number; to: number };
}
export interface SequenceTimelineItem {
  id: string;
  kind: "separator" | "delay" | "space" | "newpage" | "return";
  label: string;
  sourceRange: { from: number; to: number };
}
export interface SequenceCreation {
  id: string;
  participantKind: SequenceParticipantKind;
  participant: string;
  sourceRange: { from: number; to: number };
}
export interface SequenceReference {
  id: string;
  participants: string[];
  text: string;
  color?: string;
  multiline: boolean;
  sourceRange: { from: number; to: number };
}
export interface SequenceParticipantBox {
  id: string;
  label: string;
  color?: string;
  participants: string[];
  sourceRange: { from: number; to: number };
}
export interface SequenceAutonumber {
  id: string;
  command: "start" | "stop" | "resume" | "increment";
  value: string;
  sourceRange: { from: number; to: number };
}

export interface SequenceDocument {
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
  fragments: SequenceFragment[];
  activations: SequenceActivation[];
  notes: SequenceNote[];
  timelineItems: SequenceTimelineItem[];
  references: SequenceReference[];
  boxes: SequenceParticipantBox[];
  autonumbers: SequenceAutonumber[];
  creations: SequenceCreation[];
  durations: SequenceDuration[];
}

export interface SequenceParticipantOccurrence {
  kind: "participant" | "sequence-anchor";
  key: string;
  value: string;
  range: { from: number; to: number };
  role: "declaration" | "reference";
}

const PARTICIPANT =
  /^\s*(participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"|([^\s#<]+))(?:\s+as\s+(?:"([^"]+)"|([^\s#<]+)))?(.*)$/i;
const MESSAGE =
  /^\s*("[^"]+"|[\w.$:]+)\s+([^\s:]*[-.=\\/][^\s:]*)\s+("[^"]+"|[\w.$:]+)(\s*(?:(?:--|\+\+|\*\*|!!)(?:\s+#[\w]+)?\s*)*)\s*(?::\s*(.*))?$/i;
const INCOMING_MESSAGE =
  /^\s*([?[])\s*([^\s:]*[-.=\\/][^\s:]*)\s+("[^"]+"|[\w.$:]+)(\s*(?:(?:--|\+\+|\*\*|!!)(?:\s+#[\w]+)?\s*)*)\s*(?::\s*(.*))?$/i;
const OUTGOING_MESSAGE =
  /^\s*("[^"]+"|[\w.$:]+)\s+([^\s:]*[-.=\\/][^\s:]*)\s*([?\]])(\s*(?:(?:--|\+\+|\*\*|!!)(?:\s+#[\w]+)?\s*)*)\s*(?::\s*(.*))?$/i;

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

export function parseSequence(source: string): SequenceDocument {
  const participants: SequenceParticipant[] = [];
  const messages: SequenceMessage[] = [];
  const fragments: SequenceFragment[] = [];
  const activations: SequenceActivation[] = [];
  const notes: SequenceNote[] = [];
  const timelineItems: SequenceTimelineItem[] = [];
  const references: SequenceReference[] = [];
  const boxes: SequenceParticipantBox[] = [];
  const autonumbers: SequenceAutonumber[] = [];
  const creations: SequenceCreation[] = [];
  const durations: SequenceDuration[] = [];
  for (const match of source.matchAll(
    /^\s*(\/\s*)?(note|hnote|rnote)\s+(left of|right of|left|right|over|across)\s*([^:#\n]*?)(?:\s+(#[\w]+))?\s*\r?\n([\s\S]*?)^\s*end\s+note\s*$/gim,
  )) {
    const from = match.index!;
    notes.push({
      id: `note-${notes.length}`,
      shape: match[2]!.toLowerCase() as SequenceNote["shape"],
      aligned: Boolean(match[1]),
      placement: match[3]!.toLowerCase() as SequenceNote["placement"],
      participants: (match[4] ?? "")
        .split(",")
        .map((item) => unquote(item.trim()))
        .filter(Boolean),
      ...(match[5] ? { color: match[5] } : {}),
      text: (match[6] ?? "").trim(),
      sourceRange: { from, to: from + match[0].length },
    });
  }
  for (const match of source.matchAll(/^\s*ref\s*(#[\w]+)?\s+over\s+([^:\n]+)\s*\r?\n([\s\S]*?)^\s*end\s+ref\s*$/gim)) {
    const from = match.index!;
    references.push({
      id: `reference-${references.length}`,
      participants: match[2]!
        .split(",")
        .map((item) => unquote(item.trim()))
        .filter(Boolean),
      text: (match[3] ?? "").trim(),
      ...(match[1] ? { color: match[1] } : {}),
      multiline: true,
      sourceRange: { from, to: from + match[0].length },
    });
  }
  const fragmentStack: SequenceFragment[] = [];
  const boxStack: SequenceParticipantBox[] = [];
  let offset = 0;
  for (const line of source.split(/\n/)) {
    const range = { from: offset, to: offset + line.length };
    if (
      [...notes, ...references].some((item) => range.from >= item.sourceRange.from && range.from < item.sourceRange.to)
    ) {
      offset += line.length + 1;
      continue;
    }
    const participant = line.match(PARTICIPANT);
    if (participant) {
      const label = participant[2] ?? participant[3] ?? "";
      const alias = participant[4] ?? participant[5];
      const details = participant[6] ?? "";
      const stereotype = details.match(/<<\s*(?:\(([^,\s]),\s*([^\s)]+)\)\s*)?(.*?)\s*>>/);
      const order = details.match(/\border\s+(-?\d+)\b/i);
      const color = details.match(/(?:^|\s)(#[\w]+)(?=\s|$)/);
      participants.push({
        id: (alias ?? label).toLowerCase(),
        kind: participant[1]!.toLowerCase() as SequenceParticipantKind,
        label,
        ...(alias ? { alias } : {}),
        ...(color?.[1] ? { color: color[1] } : {}),
        ...(stereotype?.[3]?.trim() ? { stereotype: stereotype[3].trim() } : {}),
        ...(stereotype?.[1] ? { spotCharacter: stereotype[1], spotColor: stereotype[2] } : {}),
        ...(order?.[1] ? { order: Number(order[1]) } : {}),
        sourceRange: range,
      });
    } else {
      const duration = line.match(/^\s*\{([^}]+)\}\s+(<[-.]+>|<->|<-->)\s+\{([^}]+)\}\s*(?::\s*(.*))?$/i);
      const anchored = line.match(/^\s*\{([^}]+)\}\s*(.*)$/);
      const messageLine = anchored?.[2] ?? line;
      const incoming = messageLine.match(INCOMING_MESSAGE);
      const outgoing = messageLine.match(OUTGOING_MESSAGE);
      const message = messageLine.match(MESSAGE);
      if (duration)
        durations.push({
          id: `duration-${durations.length}`,
          fromAnchor: duration[1]!,
          arrow: duration[2]!,
          toAnchor: duration[3]!,
          label: duration[4] ?? "",
          sourceRange: range,
        });
      else if (incoming)
        messages.push({
          id: `message-${messages.length}`,
          from: incoming[1]!,
          arrow: incoming[2]!,
          to: unquote(incoming[3]!),
          ...(incoming[4]?.trim() ? { modifiers: incoming[4].trim() } : {}),
          label: incoming[5] ?? "",
          ...(anchored?.[1] ? { anchor: anchored[1] } : {}),
          sourceRange: range,
        });
      else if (outgoing)
        messages.push({
          id: `message-${messages.length}`,
          from: unquote(outgoing[1]!),
          arrow: outgoing[2]!,
          to: outgoing[3]!,
          ...(outgoing[4]?.trim() ? { modifiers: outgoing[4].trim() } : {}),
          label: outgoing[5] ?? "",
          ...(anchored?.[1] ? { anchor: anchored[1] } : {}),
          sourceRange: range,
        });
      else if (message)
        messages.push({
          id: `message-${messages.length}`,
          from: unquote(message[1]!),
          arrow: message[2]!,
          to: unquote(message[3]!),
          ...(message[4]?.trim() ? { modifiers: message[4].trim() } : {}),
          label: message[5] ?? "",
          ...(anchored?.[1] ? { anchor: anchored[1] } : {}),
          sourceRange: range,
        });
      else {
        const fragment = line.match(/^\s*(alt|opt|loop|par|break|critical|group)(#[\w]+)?(?:\s+(#[\w]+))?\s*(.*)$/i);
        const activation = line.match(/^\s*(activate|deactivate|destroy)\s+("[^"]+"|[^\s#]+)(?:\s+(#[\w]+))?/i);
        const note = line.match(
          /^\s*(\/\s*)?(note|hnote|rnote)\s+(left of|right of|left|right|over|across)\s*([^:#]*?)(?:\s+(#[\w]+))?\s*:\s*(.*)$/i,
        );
        const separator = line.match(/^\s*==\s*(.*?)\s*==\s*$/);
        const delay = line.match(/^\s*\.\.\.(?:(.*?)\.\.\.)?\s*$/);
        const space = line.match(/^\s*\|\|(\d*)\|\|\s*$/);
        const reference = line.match(/^\s*ref\s*(#[\w]+)?\s+over\s+([^:]+)\s*:\s*(.*)$/i);
        const box = line.match(/^\s*box(?:\s+"([^"]*)"|\s+([^#]*?))?(?:\s+(#[\w]+))?\s*$/i);
        const autonumber = line.match(/^\s*autonumber(?:\s+(stop|resume|inc\s+[ABC]|inc))?(?:\s+(.*))?$/i);
        const creation = line.match(
          /^\s*create(?:\s+(participant|actor|boundary|control|entity|database|collections|queue))?\s+("[^"]+"|\S+)\s*$/i,
        );
        const returned = line.match(/^\s*return(?:\s+(.*))?$/i);
        const newpage = line.match(/^\s*newpage(?:\s+(.*))?$/i);
        if (fragment) {
          let fragmentLabel = fragment[4]?.trim() ?? "";
          const secondary = fragment[1]!.toLowerCase() === "group" ? fragmentLabel.match(/\s*\[([^\]]*)\]\s*$/) : null;
          if (secondary) fragmentLabel = fragmentLabel.slice(0, secondary.index).trim();
          const item: SequenceFragment = {
            id: `fragment-${fragments.length}`,
            kind: fragment[1]!.toLowerCase() as SequenceFragmentKind,
            label: fragmentLabel,
            ...(secondary?.[1] ? { secondaryLabel: secondary[1] } : {}),
            ...(fragment[2] ? { headerColor: fragment[2] } : {}),
            ...(fragment[3] ? { backgroundColor: fragment[3] } : {}),
            branches: [],
            sourceRange: range,
          };
          fragments.push(item);
          fragmentStack.push(item);
        } else if (activation)
          activations.push({
            id: `activation-${activations.length}`,
            kind: activation[1]!.toLowerCase() as SequenceActivation["kind"],
            participant: unquote(activation[2]!),
            ...(activation[3] ? { color: activation[3] } : {}),
            sourceRange: range,
          });
        else if (note)
          notes.push({
            id: `note-${notes.length}`,
            shape: note[2]!.toLowerCase() as SequenceNote["shape"],
            aligned: Boolean(note[1]),
            placement: note[3]!.toLowerCase() as SequenceNote["placement"],
            participants: (note[4] ?? "")
              .split(",")
              .map((item) => unquote(item.trim()))
              .filter(Boolean),
            ...(note[5] ? { color: note[5] } : {}),
            text: note[6] ?? "",
            sourceRange: range,
          });
        else if (separator)
          timelineItems.push({
            id: `timeline-${timelineItems.length}`,
            kind: "separator",
            label: separator[1]?.trim() ?? "",
            sourceRange: range,
          });
        else if (delay)
          timelineItems.push({
            id: `timeline-${timelineItems.length}`,
            kind: "delay",
            label: delay[1]?.trim() ?? "",
            sourceRange: range,
          });
        else if (space)
          timelineItems.push({
            id: `timeline-${timelineItems.length}`,
            kind: "space",
            label: space[1] ?? "",
            sourceRange: range,
          });
        else if (reference)
          references.push({
            id: `reference-${references.length}`,
            participants: reference[2]!
              .split(",")
              .map((item) => unquote(item.trim()))
              .filter(Boolean),
            text: reference[3] ?? "",
            ...(reference[1] ? { color: reference[1] } : {}),
            multiline: false,
            sourceRange: range,
          });
        else if (box) {
          const item: SequenceParticipantBox = {
            id: `box-${boxes.length}`,
            label: (box[1] ?? box[2] ?? "").trim(),
            ...(box[3] ? { color: box[3] } : {}),
            participants: [],
            sourceRange: range,
          };
          boxes.push(item);
          boxStack.push(item);
        } else if (/^\s*end\s+box\s*$/i.test(line)) {
          const open = boxStack.pop();
          if (open) open.sourceRange.to = range.to;
        } else if (autonumber) {
          const operation = autonumber[1]?.toLowerCase() ?? "";
          autonumbers.push({
            id: `autonumber-${autonumbers.length}`,
            command:
              operation === "stop"
                ? "stop"
                : operation === "resume"
                  ? "resume"
                  : operation.startsWith("inc")
                    ? "increment"
                    : "start",
            value: operation.startsWith("inc")
              ? [operation.slice(3).trim(), autonumber[2]].filter(Boolean).join(" ")
              : (autonumber[2]?.trim() ?? ""),
            sourceRange: range,
          });
        } else if (creation)
          creations.push({
            id: `creation-${creations.length}`,
            participantKind: (creation[1]?.toLowerCase() ?? "participant") as SequenceParticipantKind,
            participant: unquote(creation[2]!),
            sourceRange: range,
          });
        else if (returned)
          timelineItems.push({
            id: `timeline-${timelineItems.length}`,
            kind: "return",
            label: returned[1]?.trim() ?? "",
            sourceRange: range,
          });
        else if (newpage)
          timelineItems.push({
            id: `timeline-${timelineItems.length}`,
            kind: "newpage",
            label: newpage[1]?.trim() ?? "",
            sourceRange: range,
          });
        else if (/^\s*end\s*$/i.test(line)) {
          const open = fragmentStack.pop();
          if (open) open.sourceRange.to = range.to;
        }
      }
    }
    offset += line.length + 1;
  }
  for (const box of boxes)
    box.participants = participants
      .filter(
        (participant) =>
          participant.sourceRange.from > box.sourceRange.from && participant.sourceRange.to < box.sourceRange.to,
      )
      .map(participantReference);
  for (const fragment of fragments) {
    const lines = source.slice(fragment.sourceRange.from, fragment.sourceRange.to).split("\n");
    let depth = 0;
    for (const line of lines.slice(1, -1)) {
      if (/^\s*(?:alt|opt|loop|par|break|critical|group)\b/i.test(line)) depth += 1;
      else if (/^\s*end\s*$/i.test(line)) depth -= 1;
      else if (depth === 0) {
        const branch = line.match(/^\s*else(?:\s+(#[\w]+))?\s*(.*)$/i);
        if (branch)
          fragment.branches.push({ label: branch[2]?.trim() ?? "", ...(branch[1] ? { color: branch[1] } : {}) });
      }
    }
  }
  notes.sort((a, b) => a.sourceRange.from - b.sourceRange.from);
  references.sort((a, b) => a.sourceRange.from - b.sourceRange.from);
  return {
    participants,
    messages,
    fragments,
    activations,
    notes,
    timelineItems,
    references,
    boxes,
    autonumbers,
    creations,
    durations,
  };
}

function quote(value: string): string {
  return /^[\w.$:]+$/.test(value) ? value : `"${value.replaceAll('"', '\\"')}"`;
}

function insertionPoint(source: string): number {
  const match = /^\s*@enduml\b/im.exec(source);
  return match?.index ?? source.length;
}

function participantReference(participant: SequenceParticipant): string {
  return participant.alias ?? participant.label;
}

function nextValueRange(source: string, range: { from: number; to: number }, value: string, after = range.from) {
  const text = source.slice(Math.max(range.from, after), range.to);
  const quoted = `"${value}"`;
  const quotedAt = text.indexOf(quoted);
  const rawAt = text.indexOf(value);
  const relative = quotedAt >= 0 && (rawAt < 0 || quotedAt <= rawAt) ? quotedAt + 1 : rawAt;
  if (relative < 0) return undefined;
  const from = Math.max(range.from, after) + relative;
  return { from, to: from + value.length };
}

export function sequenceParticipantOccurrences(
  source: string,
  document: SequenceDocument,
): SequenceParticipantOccurrence[] {
  const occurrences: SequenceParticipantOccurrence[] = [];
  const add = (
    participant: SequenceParticipant | undefined,
    value: string,
    range: { from: number; to: number },
    role: SequenceParticipantOccurrence["role"],
    after?: number,
  ) => {
    if (!participant) return undefined;
    const valueRange = nextValueRange(source, range, value, after);
    if (!valueRange) return undefined;
    occurrences.push({ kind: "participant", key: participant.id, value, range: valueRange, role });
    return valueRange.to;
  };
  const byReference = new Map(document.participants.map((item) => [participantReference(item), item]));

  for (const participant of document.participants) {
    const after = add(participant, participant.label, participant.sourceRange, "declaration");
    if (participant.alias) add(participant, participant.alias, participant.sourceRange, "declaration", after);
  }
  for (const message of document.messages) {
    const after = add(byReference.get(message.from), message.from, message.sourceRange, "reference");
    add(byReference.get(message.to), message.to, message.sourceRange, "reference", after);
  }
  for (const activation of document.activations)
    add(byReference.get(activation.participant), activation.participant, activation.sourceRange, "reference");
  for (const note of document.notes) {
    const headerEnd = source.indexOf("\n", note.sourceRange.from);
    const headerRange = { from: note.sourceRange.from, to: headerEnd < 0 ? note.sourceRange.to : headerEnd };
    let after: number | undefined;
    for (const value of note.participants)
      after = add(byReference.get(value), value, headerRange, "reference", after) ?? after;
  }
  for (const reference of document.references) {
    const headerEnd = source.indexOf("\n", reference.sourceRange.from);
    const headerRange = { from: reference.sourceRange.from, to: headerEnd < 0 ? reference.sourceRange.to : headerEnd };
    let after: number | undefined;
    for (const value of reference.participants)
      after = add(byReference.get(value), value, headerRange, "reference", after) ?? after;
  }
  for (const creation of document.creations)
    add(byReference.get(creation.participant), creation.participant, creation.sourceRange, "reference");

  const anchors = new Map<string, SequenceMessage>();
  for (const message of document.messages) {
    if (!message.anchor) continue;
    anchors.set(message.anchor, message);
    const range = nextValueRange(source, message.sourceRange, message.anchor);
    if (range)
      occurrences.push({
        kind: "sequence-anchor",
        key: message.anchor,
        value: message.anchor,
        range,
        role: "declaration",
      });
  }
  for (const duration of document.durations) {
    let after: number | undefined;
    for (const anchor of [duration.fromAnchor, duration.toAnchor]) {
      if (!anchors.has(anchor)) continue;
      const range = nextValueRange(source, duration.sourceRange, anchor, after);
      if (!range) continue;
      occurrences.push({ kind: "sequence-anchor", key: anchor, value: anchor, range, role: "reference" });
      after = range.to;
    }
  }

  return occurrences.sort((left, right) => left.range.from - right.range.from);
}

export function renameSequenceAnchor(source: string, document: SequenceDocument, anchor: string, next: string): string {
  const replacements = sequenceParticipantOccurrences(source, document)
    .filter((item) => item.kind === "sequence-anchor" && item.key === anchor)
    .map((item) => ({ ...item.range, text: next }));
  return applyReplacements(source, replacements);
}

function participantStatement(value: {
  kind: SequenceParticipantKind;
  label: string;
  alias?: string;
  color?: string;
  stereotype?: string;
  spotCharacter?: string;
  spotColor?: string;
  order?: number;
}): string {
  const spot =
    value.spotCharacter?.trim() && value.spotColor?.trim()
      ? `(${value.spotCharacter.trim().slice(0, 1)},${value.spotColor.trim()}) `
      : "";
  const stereotype = spot || value.stereotype?.trim() ? ` <<${spot}${value.stereotype?.trim() ?? ""}>>` : "";
  return `${value.kind} ${quote(value.label.trim())}${value.alias?.trim() ? ` as ${quote(value.alias.trim())}` : ""}${stereotype}${value.order !== undefined ? ` order ${value.order}` : ""}${value.color?.trim() ? ` ${value.color.trim()}` : ""}`;
}

function messageStatement(value: {
  from: string;
  to: string;
  label: string;
  arrow: string;
  modifiers?: string;
  anchor?: string;
}): string {
  const from = value.from === "[" || value.from === "?" ? value.from : quote(value.from);
  const to = value.to === "]" || value.to === "?" ? value.to : quote(value.to);
  const gapAfterFrom = value.from === "[" || value.from === "?" ? "" : " ";
  const gapBeforeTo = value.to === "]" || value.to === "?" ? "" : " ";
  return `${value.anchor?.trim() ? `{${value.anchor.trim()}} ` : ""}${from}${gapAfterFrom}${value.arrow}${gapBeforeTo}${to}${value.modifiers?.trim() ? ` ${value.modifiers.trim()}` : ""}${value.label.trim() ? `: ${value.label.trim()}` : ""}`;
}

function applyReplacements(source: string, replacements: Array<{ from: number; to: number; text: string }>): string {
  return [...replacements]
    .sort((a, b) => b.from - a.from)
    .reduce(
      (current, replacement) =>
        `${current.slice(0, replacement.from)}${replacement.text}${current.slice(replacement.to)}`,
      source,
    );
}

export function insertSequenceParticipant(
  source: string,
  value: {
    kind: SequenceParticipantKind;
    label: string;
    alias?: string;
    color?: string;
    stereotype?: string;
    spotCharacter?: string;
    spotColor?: string;
    order?: number;
  },
): string {
  const at = insertionPoint(source);
  const declaration = participantStatement(value);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${declaration}\n${source.slice(at)}`;
}

export function insertSequenceMessage(
  source: string,
  value: {
    from: string;
    to: string;
    label: string;
    arrow: string;
    modifiers?: string;
    anchor?: string;
  },
): string {
  const at = insertionPoint(source);
  const statement = messageStatement(value);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${statement}\n${source.slice(at)}`;
}

export function updateSequenceParticipant(
  source: string,
  document: SequenceDocument,
  participant: SequenceParticipant,
  value: {
    kind: SequenceParticipantKind;
    label: string;
    alias?: string;
    color?: string;
    stereotype?: string;
    spotCharacter?: string;
    spotColor?: string;
    order?: number;
  },
): string {
  const previousReference = participantReference(participant);
  const nextReference = value.alias?.trim() || value.label.trim();
  const replacements = [{ ...participant.sourceRange, text: participantStatement(value) }];
  for (const message of document.messages) {
    if (message.from !== previousReference && message.to !== previousReference) continue;
    replacements.push({
      ...message.sourceRange,
      text: messageStatement({
        ...message,
        from: message.from === previousReference ? nextReference : message.from,
        to: message.to === previousReference ? nextReference : message.to,
      }),
    });
  }
  for (const activation of document.activations) {
    if (activation.participant !== previousReference) continue;
    replacements.push({
      ...activation.sourceRange,
      text: structureStatement({
        kind: "activation",
        action: activation.kind,
        participant: nextReference,
        ...(activation.color ? { color: activation.color } : {}),
      }),
    });
  }
  for (const note of document.notes) {
    if (!note.participants.includes(previousReference)) continue;
    replacements.push({
      ...note.sourceRange,
      text: structureStatement({
        kind: "note",
        shape: note.shape,
        aligned: note.aligned,
        placement: note.placement,
        participants: note.participants.map((item) => (item === previousReference ? nextReference : item)),
        text: note.text,
        ...(note.color ? { color: note.color } : {}),
      }),
    });
  }
  for (const reference of document.references) {
    if (!reference.participants.includes(previousReference)) continue;
    replacements.push({
      ...reference.sourceRange,
      text: structureStatement({
        kind: "reference",
        multiline: reference.multiline,
        participants: reference.participants.map((item) => (item === previousReference ? nextReference : item)),
        text: reference.text,
        ...(reference.color ? { color: reference.color } : {}),
      }),
    });
  }
  for (const creation of document.creations) {
    if (creation.participant !== previousReference) continue;
    replacements.push({
      ...creation.sourceRange,
      text: structureStatement({
        kind: "create",
        participantKind: creation.participantKind,
        participant: nextReference,
      }),
    });
  }
  return applyReplacements(source, replacements);
}

export function deleteSequenceParticipant(
  source: string,
  document: SequenceDocument,
  participant: SequenceParticipant,
): string {
  const reference = participantReference(participant);
  const ranges = [
    participant.sourceRange,
    ...document.messages
      .filter((message) => message.from === reference || message.to === reference)
      .map((message) => message.sourceRange),
    ...document.activations.filter((item) => item.participant === reference).map((item) => item.sourceRange),
    ...document.notes.filter((item) => item.participants.includes(reference)).map((item) => item.sourceRange),
    ...document.references.filter((item) => item.participants.includes(reference)).map((item) => item.sourceRange),
    ...document.creations.filter((item) => item.participant === reference).map((item) => item.sourceRange),
  ];
  return applyReplacements(
    source,
    ranges.map((range) => ({
      from: range.from,
      to: Math.min(source.length, range.to + (source[range.to] === "\n" ? 1 : 0)),
      text: "",
    })),
  );
}

export function updateSequenceMessage(
  source: string,
  message: SequenceMessage,
  value: {
    from: string;
    to: string;
    label: string;
    arrow: string;
    modifiers?: string;
    anchor?: string;
  },
): string {
  return applyReplacements(source, [{ ...message.sourceRange, text: messageStatement(value) }]);
}

export function deleteSequenceMessage(source: string, message: SequenceMessage): string {
  const to = Math.min(source.length, message.sourceRange.to + (source[message.sourceRange.to] === "\n" ? 1 : 0));
  return applyReplacements(source, [{ from: message.sourceRange.from, to, text: "" }]);
}

export function findSequenceObjectAt(
  document: SequenceDocument,
  position: number,
):
  | SequenceParticipant
  | SequenceMessage
  | SequenceFragment
  | SequenceActivation
  | SequenceNote
  | SequenceTimelineItem
  | SequenceReference
  | SequenceParticipantBox
  | SequenceAutonumber
  | SequenceCreation
  | SequenceDuration
  | undefined {
  return [
    ...document.participants,
    ...document.messages,
    ...document.activations,
    ...document.notes,
    ...document.timelineItems,
    ...document.references,
    ...document.autonumbers,
    ...document.creations,
    ...document.durations,
    ...document.boxes,
    ...document.fragments,
  ].find((item) => position >= item.sourceRange.from && position <= item.sourceRange.to);
}

export type SequenceStructureInput =
  | {
      kind: "fragment";
      fragmentKind: SequenceFragmentKind;
      label: string;
      secondaryLabel?: string;
      headerColor?: string;
      backgroundColor?: string;
      branches?: Array<{ label: string; color?: string; originalIndex?: number }>;
      elseLabel?: string;
    }
  | { kind: "activation"; action: SequenceActivation["kind"]; participant: string; color?: string }
  | {
      kind: "note";
      shape?: SequenceNote["shape"];
      aligned?: boolean;
      placement: SequenceNote["placement"];
      participants: string[];
      text: string;
      color?: string;
    }
  | { kind: "separator"; label: string }
  | { kind: "delay"; label: string }
  | { kind: "space"; pixels?: number }
  | { kind: "reference"; participants: string[]; text: string; color?: string; multiline?: boolean }
  | { kind: "box"; label: string; participants: string[]; color?: string }
  | {
      kind: "autonumber";
      command: SequenceAutonumber["command"];
      value?: string;
      start?: number;
      increment?: number;
      format?: string;
    }
  | { kind: "create"; participantKind: SequenceParticipantKind; participant: string }
  | { kind: "return"; label: string }
  | { kind: "newpage"; label: string }
  | { kind: "duration"; fromAnchor: string; toAnchor: string; arrow: string; label: string };

function autonumberStatement(value: Extract<SequenceStructureInput, { kind: "autonumber" }>): string {
  const parameters = value.value?.trim();
  if (value.command === "stop") return "autonumber stop";
  if (value.command === "resume") return `autonumber resume${parameters ? ` ${parameters}` : ""}`;
  if (value.command === "increment")
    return `autonumber inc${parameters ? ` ${parameters}` : value.increment ? ` ${value.increment}` : ""}`;
  if (parameters) return `autonumber ${parameters}`;
  return `autonumber${value.start !== undefined ? ` ${value.start}` : ""}${value.increment !== undefined ? ` ${value.increment}` : ""}${value.format?.trim() ? ` "${value.format.trim().replaceAll('"', '\\"')}"` : ""}`;
}

export function insertSequenceStructure(source: string, value: SequenceStructureInput): string {
  let statement: string;
  if (value.kind === "fragment") {
    const alternatives =
      value.branches ??
      (value.fragmentKind === "alt" || value.fragmentKind === "par"
        ? [{ label: value.elseLabel?.trim() || "alternative" }]
        : []);
    statement = `${fragmentHeader(value)}\n${alternatives.map((branch) => `else${branch.color?.trim() ? ` ${branch.color.trim()}` : ""}${branch.label.trim() ? ` ${branch.label.trim()}` : ""}\n`).join("")}end`;
  } else if (value.kind === "activation") {
    statement = `${value.action} ${quote(value.participant)}${value.action === "activate" && value.color?.trim() ? ` ${value.color.trim()}` : ""}`;
  } else if (value.kind === "note") {
    const owners = value.participants.map(quote).join(", ");
    const header = `${value.aligned ? "/ " : ""}${value.shape ?? "note"} ${value.placement}${owners ? ` ${owners}` : ""}${value.color?.trim() ? ` ${value.color.trim()}` : ""}`;
    statement = value.text.includes("\n")
      ? `${header}\n${value.text.trim()}\nend note`
      : `${header}: ${value.text.trim()}`;
  } else if (value.kind === "reference") {
    const header = `ref${value.color?.trim() ?? ""} over ${value.participants.map(quote).join(", ")}`;
    statement =
      value.multiline || value.text.includes("\n")
        ? `${header}\n${value.text.trim()}\nend ref`
        : `${header}: ${value.text.trim()}`;
  } else if (value.kind === "box")
    statement = `box${value.label.trim() ? ` ${quote(value.label.trim())}` : ""}${value.color?.trim() ? ` ${value.color.trim()}` : ""}\n${value.participants.map((participant) => `participant ${quote(participant)}`).join("\n")}\nend box`;
  else if (value.kind === "autonumber") statement = autonumberStatement(value);
  else if (value.kind === "create")
    statement = `create${value.participantKind === "participant" ? "" : ` ${value.participantKind}`} ${quote(value.participant)}`;
  else if (value.kind === "return") statement = `return${value.label.trim() ? ` ${value.label.trim()}` : ""}`;
  else if (value.kind === "newpage") statement = `newpage${value.label.trim() ? ` ${value.label.trim()}` : ""}`;
  else if (value.kind === "duration")
    statement = `{${value.fromAnchor.trim()}} ${value.arrow} {${value.toAnchor.trim()}}${value.label.trim() ? `: ${value.label.trim()}` : ""}`;
  else if (value.kind === "separator") statement = `== ${value.label.trim()} ==`;
  else if (value.kind === "delay") statement = value.label.trim() ? `...${value.label.trim()}...` : "...";
  else statement = `||${value.pixels && value.pixels > 0 ? value.pixels : ""}||`;
  const at = insertionPoint(source);
  const prefix = at > 0 && source[at - 1] !== "\n" ? "\n" : "";
  return `${source.slice(0, at)}${prefix}${statement}\n${source.slice(at)}`;
}

export type SequenceStructure =
  | SequenceFragment
  | SequenceActivation
  | SequenceNote
  | SequenceTimelineItem
  | SequenceReference
  | SequenceParticipantBox
  | SequenceAutonumber
  | SequenceCreation
  | SequenceDuration;

function structureStatement(value: SequenceStructureInput): string {
  if (value.kind === "fragment") return fragmentHeader(value);
  if (value.kind === "activation")
    return `${value.action} ${quote(value.participant)}${value.action === "activate" && value.color?.trim() ? ` ${value.color.trim()}` : ""}`;
  if (value.kind === "note") {
    const owners = value.participants.map(quote).join(", ");
    const header = `${value.aligned ? "/ " : ""}${value.shape ?? "note"} ${value.placement}${owners ? ` ${owners}` : ""}${value.color?.trim() ? ` ${value.color.trim()}` : ""}`;
    return value.text.includes("\n") ? `${header}\n${value.text.trim()}\nend note` : `${header}: ${value.text.trim()}`;
  }
  if (value.kind === "reference") {
    const header = `ref${value.color?.trim() ?? ""} over ${value.participants.map(quote).join(", ")}`;
    return value.multiline || value.text.includes("\n")
      ? `${header}\n${value.text.trim()}\nend ref`
      : `${header}: ${value.text.trim()}`;
  }
  if (value.kind === "box")
    return `box${value.label.trim() ? ` ${quote(value.label.trim())}` : ""}${value.color?.trim() ? ` ${value.color.trim()}` : ""}`;
  if (value.kind === "autonumber") return autonumberStatement(value);
  if (value.kind === "create")
    return `create${value.participantKind === "participant" ? "" : ` ${value.participantKind}`} ${quote(value.participant)}`;
  if (value.kind === "return") return `return${value.label.trim() ? ` ${value.label.trim()}` : ""}`;
  if (value.kind === "newpage") return `newpage${value.label.trim() ? ` ${value.label.trim()}` : ""}`;
  if (value.kind === "duration")
    return `{${value.fromAnchor.trim()}} ${value.arrow} {${value.toAnchor.trim()}}${value.label.trim() ? `: ${value.label.trim()}` : ""}`;
  if (value.kind === "separator") return `== ${value.label.trim()} ==`;
  if (value.kind === "delay") return value.label.trim() ? `...${value.label.trim()}...` : "...";
  return `||${value.pixels && value.pixels > 0 ? value.pixels : ""}||`;
}

function fragmentHeader(value: Extract<SequenceStructureInput, { kind: "fragment" }>): string {
  return `${value.fragmentKind}${value.headerColor?.trim() ?? ""}${value.backgroundColor?.trim() ? ` ${value.backgroundColor.trim()}` : ""}${value.label.trim() ? ` ${value.label.trim()}` : ""}${value.fragmentKind === "group" && value.secondaryLabel?.trim() ? ` [${value.secondaryLabel.trim()}]` : ""}`;
}

export function insertSequenceParticipantBox(
  source: string,
  document: SequenceDocument,
  value: Extract<SequenceStructureInput, { kind: "box" }>,
): string {
  const selected = document.participants.filter((participant) =>
    value.participants.includes(participantReference(participant)),
  );
  if (!selected.length) return insertSequenceStructure(source, value);
  const declarations = selected.map((participant) =>
    source.slice(participant.sourceRange.from, participant.sourceRange.to),
  );
  const at = Math.min(...selected.map((participant) => participant.sourceRange.from));
  const without = applyReplacements(
    source,
    selected.map((participant) => ({
      from: participant.sourceRange.from,
      to: Math.min(source.length, participant.sourceRange.to + (source[participant.sourceRange.to] === "\n" ? 1 : 0)),
      text: "",
    })),
  );
  const removedBefore = selected
    .filter((participant) => participant.sourceRange.from < at)
    .reduce((total, participant) => total + participant.sourceRange.to - participant.sourceRange.from + 1, 0);
  const insertion = at - removedBefore;
  const block = `box${value.label.trim() ? ` ${quote(value.label.trim())}` : ""}${value.color?.trim() ? ` ${value.color.trim()}` : ""}\n${declarations.join("\n")}\nend box\n`;
  return `${without.slice(0, insertion)}${block}${without.slice(insertion)}`;
}

export function updateSequenceStructure(
  source: string,
  structure: SequenceStructure,
  value: SequenceStructureInput,
): string {
  if (value.kind === "box") {
    const boxIndex = parseSequence(source).boxes.findIndex(
      (item) => item.sourceRange.from === structure.sourceRange.from,
    );
    const block = source.slice(structure.sourceRange.from, structure.sourceRange.to);
    const newline = block.indexOf("\n");
    const body = newline >= 0 ? block.slice(newline) : "\nend box";
    let updated = applyReplacements(source, [
      { ...structure.sourceRange, text: `${structureStatement(value)}${body}` },
    ]);
    const desired = new Set(value.participants);
    const current = new Set("participants" in structure ? structure.participants : []);
    for (const reference of [...current].filter((name) => !desired.has(name)).reverse()) {
      const document = parseSequence(updated);
      const box = document.boxes[boxIndex];
      const participant = document.participants.find(
        (item) =>
          participantReference(item) === reference &&
          box &&
          item.sourceRange.from > box.sourceRange.from &&
          item.sourceRange.to < box.sourceRange.to,
      );
      if (!box || !participant) continue;
      const declaration = updated.slice(participant.sourceRange.from, participant.sourceRange.to);
      const to = participant.sourceRange.to + (updated[participant.sourceRange.to] === "\n" ? 1 : 0);
      updated = applyReplacements(updated, [
        { from: participant.sourceRange.from, to, text: "" },
        { from: box.sourceRange.from, to: box.sourceRange.from, text: `${declaration}\n` },
      ]);
    }
    for (const reference of [...desired].filter((name) => !current.has(name))) {
      const document = parseSequence(updated);
      const box = document.boxes[boxIndex];
      const participant = document.participants.find(
        (item) =>
          participantReference(item) === reference &&
          box &&
          !(item.sourceRange.from > box.sourceRange.from && item.sourceRange.to < box.sourceRange.to),
      );
      if (!box || !participant) continue;
      const declaration = updated.slice(participant.sourceRange.from, participant.sourceRange.to);
      const to = participant.sourceRange.to + (updated[participant.sourceRange.to] === "\n" ? 1 : 0);
      const boxBlock = updated.slice(box.sourceRange.from, box.sourceRange.to);
      const endLine = box.sourceRange.from + Math.max(0, boxBlock.lastIndexOf("\n") + 1);
      updated = applyReplacements(updated, [
        { from: participant.sourceRange.from, to, text: "" },
        { from: endLine, to: endLine, text: `${declaration}\n` },
      ]);
    }
    return updated;
  }
  if ("fragmentKind" in value) {
    const block = source.slice(structure.sourceRange.from, structure.sourceRange.to);
    const lines = block.split("\n");
    const branching = value.fragmentKind === "alt" || value.fragmentKind === "par";
    const chunks: string[][] = [[]];
    let depth = 0;
    for (const line of lines.slice(1, -1)) {
      if (/^\s*(?:alt|opt|loop|par|break|critical|group)\b/i.test(line)) depth += 1;
      if (depth === 0 && /^\s*else\b/i.test(line)) chunks.push([]);
      else chunks.at(-1)!.push(line);
      if (/^\s*end\s*$/i.test(line)) depth -= 1;
    }
    const alternatives = branching ? (value.branches ?? [{ label: "alternative" }]) : [];
    const claimed = new Set(
      alternatives.flatMap((branch) => (branch.originalIndex === undefined ? [] : [branch.originalIndex + 1])),
    );
    const retained = [chunks[0] ?? []];
    for (const branch of alternatives)
      retained.push(branch.originalIndex === undefined ? [] : (chunks[branch.originalIndex + 1] ?? []));
    for (const [index, extra] of chunks.entries()) {
      if (index === 0 || claimed.has(index)) continue;
      retained.at(-1)!.push(...extra);
    }
    const rebuilt = [structureStatement(value), ...retained[0]!];
    alternatives.forEach((branch, index) => {
      rebuilt.push(
        `else${branch.color?.trim() ? ` ${branch.color.trim()}` : ""}${branch.label.trim() ? ` ${branch.label.trim()}` : ""}`,
      );
      rebuilt.push(...retained[index + 1]!);
    });
    rebuilt.push(lines.at(-1) ?? "end");
    return applyReplacements(source, [{ ...structure.sourceRange, text: rebuilt.join("\n") }]);
  }
  return applyReplacements(source, [{ ...structure.sourceRange, text: structureStatement(value) }]);
}

export function reconnectSequenceStructure(
  source: string,
  structure: SequenceStructure,
  endpoint: number,
  participant: string,
): string {
  if ("participants" in structure && (structure.id.startsWith("note-") || structure.id.startsWith("reference-"))) {
    const participants = [...structure.participants];
    if (!participants.length) participants.push(participant);
    else participants[Math.min(Math.max(endpoint, 0), participants.length - 1)] = participant;
    if (structure.id.startsWith("note-")) {
      const note = structure as SequenceNote;
      return updateSequenceStructure(source, note, {
        kind: "note",
        shape: note.shape,
        aligned: note.aligned,
        placement: note.placement,
        participants,
        text: note.text,
        ...(note.color ? { color: note.color } : {}),
      });
    }
    const reference = structure as SequenceReference;
    return updateSequenceStructure(source, reference, {
      kind: "reference",
      participants,
      text: reference.text,
      multiline: reference.multiline,
      ...(reference.color ? { color: reference.color } : {}),
    });
  }
  if (structure.id.startsWith("activation-")) {
    const activation = structure as SequenceActivation;
    return updateSequenceStructure(source, activation, {
      kind: "activation",
      action: activation.kind,
      participant,
      ...(activation.color ? { color: activation.color } : {}),
    });
  }
  if (structure.id.startsWith("creation-")) {
    const creation = structure as SequenceCreation;
    return updateSequenceStructure(source, creation, {
      kind: "create",
      participantKind: creation.participantKind,
      participant,
    });
  }
  return source;
}

export function deleteSequenceStructure(source: string, structure: SequenceStructure): string {
  const to = Math.min(source.length, structure.sourceRange.to + (source[structure.sourceRange.to] === "\n" ? 1 : 0));
  return applyReplacements(source, [{ from: structure.sourceRange.from, to, text: "" }]);
}

export function reorderSequenceStatement(
  source: string,
  moved: { sourceRange: { from: number; to: number } },
  targetStatement: { sourceRange: { from: number; to: number } },
  placement: "before" | "after" = "before",
): string {
  if (moved.sourceRange.from === targetStatement.sourceRange.from) return source;
  if (
    targetStatement.sourceRange.from >= moved.sourceRange.from &&
    targetStatement.sourceRange.to <= moved.sourceRange.to
  )
    return source;
  const from = moved.sourceRange.from;
  const to = Math.min(source.length, moved.sourceRange.to + (source[moved.sourceRange.to] === "\n" ? 1 : 0));
  const statement = source.slice(from, to);
  const without = `${source.slice(0, from)}${source.slice(to)}`;
  const targetPosition =
    placement === "before"
      ? targetStatement.sourceRange.from
      : Math.min(
          source.length,
          targetStatement.sourceRange.to + (source[targetStatement.sourceRange.to] === "\n" ? 1 : 0),
        );
  const target = targetPosition > from ? targetPosition - (to - from) : targetPosition;
  return `${without.slice(0, target)}${statement}${without.slice(target)}`;
}
