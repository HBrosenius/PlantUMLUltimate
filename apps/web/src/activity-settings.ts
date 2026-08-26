export interface ActivitySettings {
  title: string;
  header: string;
  footer: string;
  shadowing: boolean;
  activityBackgroundColor: string;
  activityBorderColor: string;
  activityDiamondBackgroundColor: string;
  arrowColor: string;
  defaultFontName: string;
  defaultFontSize: string;
}

const managed =
  /^\s*(?:title\s+.*|header\s+.*|footer\s+.*|skinparam\s+(?:shadowing|activityBackgroundColor|activityBorderColor|activityDiamondBackgroundColor|arrowColor|defaultFontName|defaultFontSize)\s+.*)\s*$/i;

export function parseActivitySettings(source: string): ActivitySettings {
  const value: ActivitySettings = {
    title: "",
    header: "",
    footer: "",
    shadowing: true,
    activityBackgroundColor: "",
    activityBorderColor: "",
    activityDiamondBackgroundColor: "",
    arrowColor: "",
    defaultFontName: "",
    defaultFontSize: "",
  };
  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^\s*(title|header|footer)\s+(.+)$/i);
    if (heading) value[heading[1]!.toLowerCase() as "title" | "header" | "footer"] = heading[2]!.trim();
    const setting = line.match(/^\s*skinparam\s+(\w+)\s+(.+)$/i);
    if (!setting) continue;
    const key = setting[1]!.toLowerCase();
    const content = setting[2]!.trim();
    if (key === "shadowing") value.shadowing = content.toLowerCase() !== "false";
    else if (key === "activitybackgroundcolor") value.activityBackgroundColor = content;
    else if (key === "activitybordercolor") value.activityBorderColor = content;
    else if (key === "activitydiamondbackgroundcolor") value.activityDiamondBackgroundColor = content;
    else if (key === "arrowcolor") value.arrowColor = content;
    else if (key === "defaultfontname") value.defaultFontName = content;
    else if (key === "defaultfontsize") value.defaultFontSize = content;
  }
  return value;
}

export function updateActivitySettings(source: string, value: ActivitySettings) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/).filter((line) => !managed.test(line));
  const block: string[] = [];
  if (value.title.trim()) block.push(`title ${value.title.trim()}`);
  if (value.header.trim()) block.push(`header ${value.header.trim()}`);
  if (value.footer.trim()) block.push(`footer ${value.footer.trim()}`);
  if (!value.shadowing) block.push("skinparam shadowing false");
  const settings: Array<[string, string]> = [
    ["activityBackgroundColor", value.activityBackgroundColor],
    ["activityBorderColor", value.activityBorderColor],
    ["activityDiamondBackgroundColor", value.activityDiamondBackgroundColor],
    ["arrowColor", value.arrowColor],
    ["defaultFontName", value.defaultFontName],
    ["defaultFontSize", value.defaultFontSize],
  ];
  for (const [key, content] of settings) if (content.trim()) block.push(`skinparam ${key} ${content.trim()}`);
  const at = lines.findIndex((line) => /^\s*@startuml/i.test(line));
  lines.splice(at >= 0 ? at + 1 : 0, 0, ...block);
  return lines.join(newline);
}
