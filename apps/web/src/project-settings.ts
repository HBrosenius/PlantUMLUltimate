export type GanttScale = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface CalendarDateRule {
  id: string;
  from: string;
  to: string;
  state: "closed" | "opened" | "colored";
  color?: string;
}

export interface ProjectSettings {
  title: string;
  header: string;
  footer: string;
  caption: string;
  startDate: string;
  scale: GanttScale;
  scaleZoom: string;
  closedWeekdays: number[];
  dateRules: CalendarDateRule[];
  hideFootbox: boolean;
  hideResourceNames: boolean;
  hideResourceFootbox: boolean;
  highlightToday: boolean;
  todayColor: string;
}

export const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const iso = (value: string) => value.replaceAll("/", "-");
const directive =
  /^\s*(?:title\s+.*|header\s+.*|footer\s+.*|caption\s+.*|Project\s+starts\s+.+|(?:printscale|ganttscale|projectscale)\s+(?:daily|weekly|monthly|quarterly|yearly)(?:\s+zoom\s+\d+)?|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:is|are)\s+(?:closed|opened)|\d{4}[-/]\d{2}[-/]\d{2}(?:\s+to\s+\d{4}[-/]\d{2}[-/]\d{2})?\s+(?:(?:is|are)\s+(?:closed|opened)|(?:is|are)\s+colou?red\s+in\s+\S+)|today\s+is\s+colou?red\s+in\s+\S+|hide\s+(?:footbox|resources\s+names|resources\s+footbox))\s*$/i;

export function parseProjectSettings(source: string): ProjectSettings {
  const settings: ProjectSettings = {
    title: "",
    header: "",
    footer: "",
    caption: "",
    startDate: "",
    scale: "daily",
    scaleZoom: "",
    closedWeekdays: [],
    dateRules: [],
    hideFootbox: false,
    hideResourceNames: false,
    hideResourceFootbox: false,
    highlightToday: false,
    todayColor: "#AAF",
  };
  let ruleIndex = 0;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const title = line.match(/^title\s+(.+?)\s*$/i);
    if (title?.[1]) {
      settings.title = title[1];
      continue;
    }
    const presentation = line.match(/^(header|footer|caption)\s+(.+?)\s*$/i);
    if (presentation?.[1] && presentation[2]) {
      settings[presentation[1].toLowerCase() as "header" | "footer" | "caption"] = presentation[2];
      continue;
    }
    const start = line.match(/^Project\s+starts\s+(\d{4}[-/]\d{2}[-/]\d{2})$/i);
    if (start?.[1]) {
      settings.startDate = iso(start[1]);
      continue;
    }
    const scale = line.match(
      /^(?:printscale|ganttscale|projectscale)\s+(daily|weekly|monthly|quarterly|yearly)(?:\s+zoom\s+(\d+))?$/i,
    );
    if (scale?.[1]) {
      settings.scale = scale[1].toLowerCase() as GanttScale;
      settings.scaleZoom = scale[2] ?? "";
      continue;
    }
    const weekday = line.match(
      /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:is|are)\s+(closed|opened)$/i,
    );
    if (weekday?.[1] && weekday[2]) {
      const index = WEEKDAY_NAMES.indexOf(weekday[1].toLowerCase() as (typeof WEEKDAY_NAMES)[number]);
      if (weekday[2].toLowerCase() === "closed" && !settings.closedWeekdays.includes(index))
        settings.closedWeekdays.push(index);
      else if (weekday[2].toLowerCase() === "opened")
        settings.closedWeekdays = settings.closedWeekdays.filter((item) => item !== index);
      continue;
    }
    const date = line.match(
      /^(\d{4}[-/]\d{2}[-/]\d{2})(?:\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2}))?\s+(?:is|are)\s+(closed|opened)$/i,
    );
    if (date?.[1] && date[3])
      settings.dateRules.push({
        id: `rule-${ruleIndex++}`,
        from: iso(date[1]),
        to: iso(date[2] ?? date[1]),
        state: date[3].toLowerCase() as "closed" | "opened",
      });
    const dateColor = line.match(
      /^(\d{4}[-/]\d{2}[-/]\d{2})(?:\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2}))?\s+(?:is|are)\s+colou?red\s+in\s+(\S+)$/i,
    );
    if (dateColor?.[1] && dateColor[3])
      settings.dateRules.push({
        id: `rule-${ruleIndex++}`,
        from: iso(dateColor[1]),
        to: iso(dateColor[2] ?? dateColor[1]),
        state: "colored",
        color: dateColor[3],
      });
    const today = line.match(/^today\s+is\s+colou?red\s+in\s+(\S+)$/i);
    if (today?.[1]) {
      settings.highlightToday = true;
      settings.todayColor = today[1];
    }
    if (/^hide\s+footbox$/i.test(line)) settings.hideFootbox = true;
    if (/^hide\s+resources\s+names$/i.test(line)) settings.hideResourceNames = true;
    if (/^hide\s+resources\s+footbox$/i.test(line)) settings.hideResourceFootbox = true;
  }
  return settings;
}

export function updateProjectSettings(source: string, value: ProjectSettings): string {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const firstOwned = lines.findIndex((line) => directive.test(line));
  const startMarker = lines.findIndex((line) => /^\s*@startgantt\b/i.test(line));
  const insertAt = firstOwned >= 0 ? firstOwned : Math.max(0, startMarker + 1);
  const remaining = lines.filter((line) => !directive.test(line));
  const removedBefore = lines.slice(0, insertAt).filter((line) => directive.test(line)).length;
  const block: string[] = [];
  if (value.title.trim()) block.push(`title ${value.title.trim()}`);
  if (value.header.trim()) block.push(`header ${value.header.trim()}`);
  if (value.footer.trim()) block.push(`footer ${value.footer.trim()}`);
  if (value.caption.trim()) block.push(`caption ${value.caption.trim()}`);
  if (value.startDate) block.push(`Project starts ${value.startDate}`);
  block.push(`printscale ${value.scale}${value.scaleZoom ? ` zoom ${value.scaleZoom}` : ""}`);
  for (const index of [...value.closedWeekdays].sort()) block.push(`${WEEKDAY_NAMES[index]} are closed`);
  for (const rule of value.dateRules)
    block.push(
      `${rule.from}${rule.to && rule.to !== rule.from ? ` to ${rule.to}` : ""} ${rule.from !== rule.to ? "are" : "is"} ${rule.state === "colored" ? `colored in ${rule.color || "LightGray"}` : rule.state}`,
    );
  if (value.highlightToday) block.push(`today is colored in ${value.todayColor || "#AAF"}`);
  if (value.hideFootbox) block.push("hide footbox");
  if (value.hideResourceNames) block.push("hide resources names");
  if (value.hideResourceFootbox) block.push("hide resources footbox");
  remaining.splice(insertAt - removedBefore, 0, ...block);
  return remaining.join(newline);
}
