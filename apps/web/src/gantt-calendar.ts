import type { GanttTask } from "@plantuml-studio/diagram-gantt";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;
export interface GanttCalendar {
  closedWeekdays: Set<number>;
  closedDates: Set<string>;
  openedDates: Set<string>;
}

export function parseGanttCalendar(source: string): GanttCalendar {
  const calendar: GanttCalendar = { closedWeekdays: new Set(), closedDates: new Set(), openedDates: new Set() };
  for (const line of source.split(/\r?\n/)) {
    const weekday = line
      .trim()
      .match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:is|are)\s+(closed|opened)\s*$/i);
    if (weekday?.[1] && weekday[2]) {
      const index = WEEKDAYS.indexOf(weekday[1].toLowerCase());
      if (weekday[2].toLowerCase() === "closed") calendar.closedWeekdays.add(index);
      else calendar.closedWeekdays.delete(index);
      continue;
    }
    const date = line.trim().match(/^(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:is|are)\s+(closed|opened)\s*$/i);
    if (date?.[1] && date[2]) {
      const value = date[1].replaceAll("/", "-");
      if (date[2].toLowerCase() === "closed") {
        calendar.closedDates.add(value);
        calendar.openedDates.delete(value);
      } else {
        calendar.openedDates.add(value);
        calendar.closedDates.delete(value);
      }
      continue;
    }
    const range = line
      .trim()
      .match(/^(\d{4}[-/]\d{2}[-/]\d{2})\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+(?:is|are)\s+(closed|opened)\s*$/i);
    if (range?.[1] && range[2] && range[3]) {
      let value = range[1].replaceAll("/", "-");
      const end = range[2].replaceAll("/", "-");
      while (value <= end) {
        if (range[3].toLowerCase() === "closed") {
          calendar.closedDates.add(value);
          calendar.openedDates.delete(value);
        } else {
          calendar.openedDates.add(value);
          calendar.closedDates.delete(value);
        }
        value = shiftDate(value, 1)!;
      }
    }
  }
  return calendar;
}

export function shiftDate(value: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isWorkingDate(value: string, calendar: GanttCalendar): boolean {
  if (calendar.openedDates.has(value)) return true;
  if (calendar.closedDates.has(value)) return false;
  return !calendar.closedWeekdays.has(new Date(`${value}T00:00:00Z`).getUTCDay());
}

export function workingDayDuration(start: string, end: string, calendar: GanttCalendar): number | undefined {
  if (!shiftDate(start, 0) || !shiftDate(end, 0) || end < start) return undefined;
  let value = start;
  let duration = 0;
  while (value <= end) {
    if (isWorkingDate(value, calendar)) duration += 1;
    value = shiftDate(value, 1)!;
  }
  return duration || undefined;
}

export function workingEndDate(start: string, durationDays: number, calendar: GanttCalendar): string | undefined {
  if (!shiftDate(start, 0) || !Number.isInteger(durationDays) || durationDays < 1) return undefined;
  let value = start;
  while (!isWorkingDate(value, calendar)) value = shiftDate(value, 1)!;
  let remaining = durationDays - 1;
  while (remaining > 0) {
    value = shiftDate(value, 1)!;
    if (isWorkingDate(value, calendar)) remaining -= 1;
  }
  return value;
}

function taskEnd(task: GanttTask, calendar: GanttCalendar): string | undefined {
  if (!task.start?.resolved || !task.duration || task.duration.unit !== "day") return undefined;
  return workingEndDate(task.start.value, task.duration.value, calendar);
}

export interface CalendarResizeTarget {
  calendarDays: number;
  durationDelta: number;
  endDate: string;
}
export function calendarResizeTarget(
  task: GanttTask,
  requestedCalendarDays: number,
  calendar: GanttCalendar,
): CalendarResizeTarget | undefined {
  const currentEnd = taskEnd(task, calendar);
  if (!currentEnd || !task.duration) return undefined;
  const direction = requestedCalendarDays < 0 ? -1 : 1;
  let endDate = shiftDate(currentEnd, requestedCalendarDays)!;
  while (!isWorkingDate(endDate, calendar)) endDate = shiftDate(endDate, direction)!;
  const calendarDays = Math.round(
    (new Date(`${endDate}T00:00:00Z`).valueOf() - new Date(`${currentEnd}T00:00:00Z`).valueOf()) / DAY_MS,
  );
  let durationDelta = 0;
  if (calendarDays > 0)
    for (let day = 1; day <= calendarDays; day += 1) {
      if (isWorkingDate(shiftDate(currentEnd, day)!, calendar)) durationDelta += 1;
    }
  else
    for (let day = -1; day >= calendarDays; day -= 1) {
      if (isWorkingDate(shiftDate(currentEnd, day)!, calendar)) durationDelta -= 1;
    }
  return { calendarDays, durationDelta, endDate };
}
