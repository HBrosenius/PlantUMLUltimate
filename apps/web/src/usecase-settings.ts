export interface UseCaseSettings {
  direction: "" | "left-to-right" | "top-to-bottom";
  title: string;
  caption: string;
  header: string;
  footer: string;
  packageStyle: "" | "rectangle" | "node" | "folder" | "frame" | "cloud" | "database";
  shadowing: boolean;
  monochrome: boolean;
  handwritten: boolean;
  hideStereotypes: boolean;
  defaultFontName: string;
  defaultFontSize: string;
  actorBackgroundColor: string;
  actorBorderColor: string;
  usecaseBackgroundColor: string;
  usecaseBorderColor: string;
  arrowColor: string;
  noteBackgroundColor: string;
  noteBorderColor: string;
}

const SKINPARAM_KEYS = [
  "packageStyle",
  "shadowing",
  "monochrome",
  "handwritten",
  "defaultFontName",
  "defaultFontSize",
  "actorBackgroundColor",
  "actorBorderColor",
  "usecaseBackgroundColor",
  "usecaseBorderColor",
  "arrowColor",
  "noteBackgroundColor",
  "noteBorderColor",
].join("|");

const MANAGED_LINE = new RegExp(
  `^\\s*(?:title\\s+.*|caption\\s+.*|header\\s+.*|footer\\s+.*|(?:left to right|top to bottom) direction|hide\\s+stereotype|skinparam\\s+(?:${SKINPARAM_KEYS})\\s+.*)\\s*$`,
  "i",
);

export function parseUseCaseSettings(source: string): UseCaseSettings {
  const value: UseCaseSettings = {
    direction: "",
    title: "",
    caption: "",
    header: "",
    footer: "",
    packageStyle: "",
    shadowing: true,
    monochrome: false,
    handwritten: false,
    hideStereotypes: false,
    defaultFontName: "",
    defaultFontSize: "",
    actorBackgroundColor: "",
    actorBorderColor: "",
    usecaseBackgroundColor: "",
    usecaseBorderColor: "",
    arrowColor: "",
    noteBackgroundColor: "",
    noteBorderColor: "",
  };
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*left to right direction\s*$/i.test(line)) value.direction = "left-to-right";
    if (/^\s*top to bottom direction\s*$/i.test(line)) value.direction = "top-to-bottom";
    const presentation = line.match(/^\s*(title|caption|header|footer)\s+(.+?)\s*$/i);
    if (presentation)
      value[presentation[1]!.toLowerCase() as "title" | "caption" | "header" | "footer"] = presentation[2]!;
    if (/^\s*hide\s+stereotype\s*$/i.test(line)) value.hideStereotypes = true;
    const skinparam = line.match(/^\s*skinparam\s+(\w+)\s+(.+?)\s*$/i);
    if (!skinparam) continue;
    const key = skinparam[1]!.toLowerCase();
    const setting = skinparam[2]!;
    if (key === "packagestyle") value.packageStyle = setting.toLowerCase() as UseCaseSettings["packageStyle"];
    else if (key === "shadowing") value.shadowing = setting.toLowerCase() !== "false";
    else if (key === "monochrome") value.monochrome = setting.toLowerCase() === "true";
    else if (key === "handwritten") value.handwritten = setting.toLowerCase() === "true";
    else if (key === "defaultfontname") value.defaultFontName = setting;
    else if (key === "defaultfontsize") value.defaultFontSize = setting;
    else if (key === "actorbackgroundcolor") value.actorBackgroundColor = setting;
    else if (key === "actorbordercolor") value.actorBorderColor = setting;
    else if (key === "usecasebackgroundcolor") value.usecaseBackgroundColor = setting;
    else if (key === "usecasebordercolor") value.usecaseBorderColor = setting;
    else if (key === "arrowcolor") value.arrowColor = setting;
    else if (key === "notebackgroundcolor") value.noteBackgroundColor = setting;
    else if (key === "notebordercolor") value.noteBorderColor = setting;
  }
  return value;
}

export function updateUseCaseSettings(source: string, value: UseCaseSettings): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/).filter((line) => !MANAGED_LINE.test(line));
  const block: string[] = [];
  if (value.direction === "left-to-right") block.push("left to right direction");
  if (value.direction === "top-to-bottom") block.push("top to bottom direction");
  if (value.title.trim()) block.push(`title ${value.title.trim()}`);
  if (value.caption.trim()) block.push(`caption ${value.caption.trim()}`);
  if (value.header.trim()) block.push(`header ${value.header.trim()}`);
  if (value.footer.trim()) block.push(`footer ${value.footer.trim()}`);
  if (value.packageStyle) block.push(`skinparam packageStyle ${value.packageStyle}`);
  if (!value.shadowing) block.push("skinparam shadowing false");
  if (value.monochrome) block.push("skinparam monochrome true");
  if (value.handwritten) block.push("skinparam handwritten true");
  if (value.hideStereotypes) block.push("hide stereotype");
  const textSettings: Array<[string, string]> = [
    ["defaultFontName", value.defaultFontName],
    ["defaultFontSize", value.defaultFontSize],
    ["actorBackgroundColor", value.actorBackgroundColor],
    ["actorBorderColor", value.actorBorderColor],
    ["usecaseBackgroundColor", value.usecaseBackgroundColor],
    ["usecaseBorderColor", value.usecaseBorderColor],
    ["arrowColor", value.arrowColor],
    ["noteBackgroundColor", value.noteBackgroundColor],
    ["noteBorderColor", value.noteBorderColor],
  ];
  for (const [name, setting] of textSettings) if (setting.trim()) block.push(`skinparam ${name} ${setting.trim()}`);
  const start = lines.findIndex((line) => /^\s*@startuml\b/i.test(line));
  lines.splice(start >= 0 ? start + 1 : 0, 0, ...block);
  return lines.join(newline);
}
