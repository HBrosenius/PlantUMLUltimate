export interface ClassSettings {
  direction: "" | "left-to-right" | "top-to-bottom";
  title: string;
  header: string;
  footer: string;
  hideEmptyFields: boolean;
  hideEmptyMethods: boolean;
  attributeIcons: boolean;
  shadowing: boolean;
  classBackgroundColor: string;
  classBorderColor: string;
  arrowColor: string;
  defaultFontName: string;
  defaultFontSize: string;
}
const managed =
  /^\s*(?:title\s+.*|header\s+.*|footer\s+.*|(?:left to right|top to bottom) direction|hide empty (?:fields|methods)|skinparam\s+(?:classAttributeIconSize|shadowing|classBackgroundColor|classBorderColor|arrowColor|defaultFontName|defaultFontSize)\s+.*)\s*$/i;
export function parseClassSettings(s: string): ClassSettings {
  const v: ClassSettings = {
    direction: "",
    title: "",
    header: "",
    footer: "",
    hideEmptyFields: false,
    hideEmptyMethods: false,
    attributeIcons: true,
    shadowing: true,
    classBackgroundColor: "",
    classBorderColor: "",
    arrowColor: "",
    defaultFontName: "",
    defaultFontSize: "",
  };
  for (const l of s.split(/\r?\n/)) {
    if (/^\s*left to right direction/i.test(l)) v.direction = "left-to-right";
    if (/^\s*top to bottom direction/i.test(l)) v.direction = "top-to-bottom";
    const p = l.match(/^\s*(title|header|footer)\s+(.+)$/i);
    if (p) v[p[1]!.toLowerCase() as "title" | "header" | "footer"] = p[2]!.trim();
    if (/^\s*hide empty fields/i.test(l)) v.hideEmptyFields = true;
    if (/^\s*hide empty methods/i.test(l)) v.hideEmptyMethods = true;
    const x = l.match(/^\s*skinparam\s+(\w+)\s+(.+)$/i);
    if (!x) continue;
    const k = x[1]!.toLowerCase(),
      z = x[2]!.trim();
    if (k === "classattributeiconsize") v.attributeIcons = z !== "0";
    else if (k === "shadowing") v.shadowing = z.toLowerCase() !== "false";
    else if (k === "classbackgroundcolor") v.classBackgroundColor = z;
    else if (k === "classbordercolor") v.classBorderColor = z;
    else if (k === "arrowcolor") v.arrowColor = z;
    else if (k === "defaultfontname") v.defaultFontName = z;
    else if (k === "defaultfontsize") v.defaultFontSize = z;
  }
  return v;
}
export function updateClassSettings(s: string, v: ClassSettings) {
  const nl = s.includes("\r\n") ? "\r\n" : "\n",
    lines = s.split(/\r?\n/).filter((l) => !managed.test(l)),
    b: string[] = [];
  if (v.direction) b.push(v.direction === "left-to-right" ? "left to right direction" : "top to bottom direction");
  if (v.title.trim()) b.push(`title ${v.title.trim()}`);
  if (v.header.trim()) b.push(`header ${v.header.trim()}`);
  if (v.footer.trim()) b.push(`footer ${v.footer.trim()}`);
  if (v.hideEmptyFields) b.push("hide empty fields");
  if (v.hideEmptyMethods) b.push("hide empty methods");
  if (!v.attributeIcons) b.push("skinparam classAttributeIconSize 0");
  if (!v.shadowing) b.push("skinparam shadowing false");
  const textSettings: Array<[string, string]> = [
    ["classBackgroundColor", v.classBackgroundColor],
    ["classBorderColor", v.classBorderColor],
    ["arrowColor", v.arrowColor],
    ["defaultFontName", v.defaultFontName],
    ["defaultFontSize", v.defaultFontSize],
  ];
  for (const [k, z] of textSettings) if (z.trim()) b.push(`skinparam ${k} ${z.trim()}`);
  const at = lines.findIndex((l) => /^\s*@startuml/i.test(l));
  lines.splice(at >= 0 ? at + 1 : 0, 0, ...b);
  return lines.join(nl);
}
