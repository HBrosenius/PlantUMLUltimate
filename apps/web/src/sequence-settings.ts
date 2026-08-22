export interface SequenceSettings {
  title: string;
  header: string;
  footer: string;
  autoactivate: boolean;
  hideFootbox: boolean;
  hideUnlinked: boolean;
  autonumber: boolean;
  autonumberStart: string;
  autonumberIncrement: string;
  autonumberFormat: string;
  teoz: boolean;
  messageAlignment: "" | "left" | "center" | "right";
  responseBelowArrow: boolean;
  maxMessageSize: string;
  participantPadding: string;
  boxPadding: string;
  arrowColor: string;
  participantBackgroundColor: string;
  participantBorderColor: string;
  lifelineColor: string;
  noteBackgroundColor: string;
  noteBorderColor: string;
  groupBorderColor: string;
}

const MANAGED_LINE = /^\s*(?:title\s+.*|header\s+.*|footer\s+.*|autoactivate\s+(?:on|off)|hide\s+(?:footbox|unlinked)|autonumber(?!\s+(?:stop|resume|inc)\b).*|!?pragma\s+teoz\s+\w+|skinparam\s+(?:sequenceMessageAlign|responseMessageBelowArrow|maxMessageSize|ParticipantPadding|BoxPadding|sequenceArrowColor|sequenceParticipantBackgroundColor|sequenceParticipantBorderColor|sequenceLifeLineBorderColor|noteBackgroundColor|noteBorderColor|sequenceGroupBorderColor)\s+.*)\s*$/i;

export function parseSequenceSettings(source: string): SequenceSettings {
  const value: SequenceSettings = {
    title: "",
    header: "",
    footer: "",
    autoactivate: false,
    hideFootbox: false,
    hideUnlinked: false,
    autonumber: false,
    autonumberStart: "",
    autonumberIncrement: "",
    autonumberFormat: "",
    teoz: false,
    messageAlignment: "",
    responseBelowArrow: false,
    maxMessageSize: "",
    participantPadding: "",
    boxPadding: "",
    arrowColor: "",
    participantBackgroundColor: "",
    participantBorderColor: "",
    lifelineColor: "",
    noteBackgroundColor: "",
    noteBorderColor: "",
    groupBorderColor: "",
  };
  for (const line of source.split(/\r?\n/)) {
    const presentation = line.match(/^\s*(title|header|footer)\s+(.+?)\s*$/i);
    if (presentation) value[presentation[1]!.toLowerCase() as "title" | "header" | "footer"] = presentation[2]!;
    const activation = line.match(/^\s*autoactivate\s+(on|off)\s*$/i);
    if (activation) value.autoactivate = activation[1]!.toLowerCase() === "on";
    if (/^\s*hide\s+footbox\s*$/i.test(line)) value.hideFootbox = true;
    if (/^\s*hide\s+unlinked\s*$/i.test(line)) value.hideUnlinked = true;
    const numbering = line.match(/^\s*autonumber(?!\s+(?:stop|resume|inc)\b)(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+(?:"([^"]*)"|(\S+)))?\s*$/i);
    if (numbering) {
      value.autonumber = true;
      value.autonumberStart = numbering[1] ?? "";
      value.autonumberIncrement = numbering[2] ?? "";
      value.autonumberFormat = numbering[3] ?? numbering[4] ?? "";
    }
    const teoz = line.match(/^\s*!?pragma\s+teoz\s+(true|false)\s*$/i);
    if (teoz) value.teoz = teoz[1]!.toLowerCase() === "true";
    const skinparam = line.match(/^\s*skinparam\s+(sequenceMessageAlign|responseMessageBelowArrow|maxMessageSize|ParticipantPadding|BoxPadding|sequenceArrowColor|sequenceParticipantBackgroundColor|sequenceParticipantBorderColor|sequenceLifeLineBorderColor|noteBackgroundColor|noteBorderColor|sequenceGroupBorderColor)\s+(\S+)\s*$/i);
    if (skinparam) {
      const name = skinparam[1]!.toLowerCase();
      if (name === "sequencemessagealign") value.messageAlignment = skinparam[2]!.toLowerCase() as SequenceSettings["messageAlignment"];
      else if (name === "responsemessagebelowarrow") value.responseBelowArrow = skinparam[2]!.toLowerCase() === "true";
      else if (name === "maxmessagesize") value.maxMessageSize = skinparam[2]!;
      else if (name === "participantpadding") value.participantPadding = skinparam[2]!;
      else if (name === "boxpadding") value.boxPadding = skinparam[2]!;
      else if (name === "sequencearrowcolor") value.arrowColor = skinparam[2]!;
      else if (name === "sequenceparticipantbackgroundcolor") value.participantBackgroundColor = skinparam[2]!;
      else if (name === "sequenceparticipantbordercolor") value.participantBorderColor = skinparam[2]!;
      else if (name === "sequencelifelinebordercolor") value.lifelineColor = skinparam[2]!;
      else if (name === "notebackgroundcolor") value.noteBackgroundColor = skinparam[2]!;
      else if (name === "notebordercolor") value.noteBorderColor = skinparam[2]!;
      else value.groupBorderColor = skinparam[2]!;
    }
  }
  return value;
}

function quoteFormat(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function updateSequenceSettings(source: string, value: SequenceSettings): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/).filter((line) => !MANAGED_LINE.test(line));
  const block: string[] = [];
  if (value.title.trim()) block.push(`title ${value.title.trim()}`);
  if (value.header.trim()) block.push(`header ${value.header.trim()}`);
  if (value.footer.trim()) block.push(`footer ${value.footer.trim()}`);
  if (value.autoactivate) block.push("autoactivate on");
  if (value.hideFootbox) block.push("hide footbox");
  if (value.hideUnlinked) block.push("hide unlinked");
  if (value.autonumber) {
    const parts = ["autonumber"];
    if (value.autonumberStart.trim()) parts.push(value.autonumberStart.trim());
    if (value.autonumberIncrement.trim()) parts.push(value.autonumberIncrement.trim());
    if (value.autonumberFormat.trim()) parts.push(quoteFormat(value.autonumberFormat.trim()));
    block.push(parts.join(" "));
  }
  if (value.teoz) block.push("!pragma teoz true");
  if (value.messageAlignment) block.push(`skinparam sequenceMessageAlign ${value.messageAlignment}`);
  if (value.responseBelowArrow) block.push("skinparam responseMessageBelowArrow true");
  if (value.maxMessageSize.trim()) block.push(`skinparam maxMessageSize ${value.maxMessageSize.trim()}`);
  if (value.participantPadding.trim()) block.push(`skinparam ParticipantPadding ${value.participantPadding.trim()}`);
  if (value.boxPadding.trim()) block.push(`skinparam BoxPadding ${value.boxPadding.trim()}`);
  if (value.arrowColor.trim()) block.push(`skinparam sequenceArrowColor ${value.arrowColor.trim()}`);
  if (value.participantBackgroundColor.trim()) block.push(`skinparam sequenceParticipantBackgroundColor ${value.participantBackgroundColor.trim()}`);
  if (value.participantBorderColor.trim()) block.push(`skinparam sequenceParticipantBorderColor ${value.participantBorderColor.trim()}`);
  if (value.lifelineColor.trim()) block.push(`skinparam sequenceLifeLineBorderColor ${value.lifelineColor.trim()}`);
  if (value.noteBackgroundColor.trim()) block.push(`skinparam noteBackgroundColor ${value.noteBackgroundColor.trim()}`);
  if (value.noteBorderColor.trim()) block.push(`skinparam noteBorderColor ${value.noteBorderColor.trim()}`);
  if (value.groupBorderColor.trim()) block.push(`skinparam sequenceGroupBorderColor ${value.groupBorderColor.trim()}`);
  const start = lines.findIndex((line) => /^\s*@startuml\b/i.test(line));
  lines.splice(start >= 0 ? start + 1 : 0, 0, ...block);
  return lines.join(newline);
}
