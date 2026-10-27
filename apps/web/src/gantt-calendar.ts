import {
  MAX_CALENDAR_DAYS,
  MAX_WORK_DAYS,
  shiftIsoDateSafely,
  validIsoDate,
  type GanttTask,
} from "@plantuml-studio/diagram-gantt";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_MS = 86_400_000;
export interface GanttCalendar {
  closedWeekdays: Set<number>;
  closedDates: Set<string>;
  openedDates: Set<string>;
  error?: string;
}

/** Matches literal dates and recurring weekdays; callers keep their own calendar rules. */
export function taskPauses(task: GanttTask): Pick<ReadonlySet<string>, "has"> {
  const dates = new Set(task.pauses?.filter((pause) => pause.resolved).map((pause) => pause.value));
  const weekdays = new Set(task.pauses?.map((pause) => WEEKDAYS.indexOf(pause.value.toLowerCase())));
  return {
    has: (date) => dates.has(date) || weekdays.has(new Date(`${date}T00:00:00Z`).getUTCDay()),
  };
}

export function parseGanttCalendar(source: string): GanttCalendar {
  const calendar: GanttCalendar = { closedWeekdays: new Set(), closedDates: new Set(), openedDates: new Set() };
  let expanded = 0;
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
      if (!validIsoDate(value)) {
        calendar.error = "Calendar contains an invalid date";
        continue;
      }
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
      if (!validIsoDate(value) || !validIsoDate(end) || value > end) {
        calendar.error = "Calendar contains an invalid date range";
        continue;
      }
      while (value <= end) {
        if (++expanded > MAX_CALENDAR_DAYS) {
          calendar.error = "Calendar date ranges exceed the supported limit";
          return calendar;
        }
        if (range[3].toLowerCase() === "closed") {
          calendar.closedDates.add(value);
          calendar.openedDates.delete(value);
        } else {
          calendar.openedDates.add(value);
          calendar.closedDates.delete(value);
        }
        const next = shiftDate(value, 1);
        if (!next) break;
        value = next;
      }
    }
  }
  if (calendar.closedWeekdays.size === 7 && calendar.openedDates.size === 0)
    calendar.error = "Calendar has no working days";
  return calendar;
}

export function shiftDate(value: string, days: number): string | undefined {
  return shiftIsoDateSafely(value, days);
}

export function isWorkingDate(value: string, calendar: GanttCalendar): boolean {
  if (!validIsoDate(value) || calendar.error) return false;
  if (calendar.openedDates.has(value)) return true;
  if (calendar.closedDates.has(value)) return false;
  return !calendar.closedWeekdays.has(new Date(`${value}T00:00:00Z`).getUTCDay());
}

export function workingDates(
  start: string,
  days: number,
  calendar: GanttCalendar,
  pauses: Pick<ReadonlySet<string>, "has"> = new Set(),
  budget = { remaining: MAX_CALENDAR_DAYS },
): string[] | undefined {
  if (!validIsoDate(start) || calendar.error || !Number.isSafeInteger(days) || days < 1 || days > MAX_WORK_DAYS)
    return undefined;
  const dates: string[] = [];
  let value: string | undefined = start;
  for (let scanned = 0; value && scanned < MAX_CALENDAR_DAYS; scanned += 1) {
    if (budget.remaining-- <= 0) return undefined;
    if (isWorkingDate(value, calendar) && !pauses.has(value)) dates.push(value);
    if (dates.length === days) return dates;
    value = shiftDate(value, 1);
  }
  return undefined;
}

export function workingDayDuration(start: string, end: string, calendar: GanttCalendar): number | undefined {
  if (!shiftDate(start, 0) || !shiftDate(end, 0) || end < start) return undefined;
  let value = start;
  let duration = 0;
  let scanned = 0;
  while (value <= end) {
    if (++scanned > MAX_CALENDAR_DAYS || calendar.error) return undefined;
    if (isWorkingDate(value, calendar)) duration += 1;
    const next = shiftDate(value, 1);
    if (!next) break;
    value = next;
  }
  return duration || undefined;
}

export function workingEndDate(start: string, durationDays: number, calendar: GanttCalendar): string | undefined {
  return workingDates(start, durationDays, calendar)?.at(-1);
}

export interface CalendarResizeTarget {
  calendarDays: number;
  durationDelta: number;
  endDate: string;
}
/**
 * Snaps a resize drag to the duration whose drawn end is nearest the requested end. A task at a
 * partial allocation takes more calendar days per duration day, and pauses are skipped like closed days.
 */
export function calendarResizeTarget(
  task: GanttTask,
  requestedCalendarDays: number,
  calendar: GanttCalendar,
  allocationPercent = 100,
): CalendarResizeTarget | undefined {
  if (!task.start?.resolved || !task.duration || task.duration.unit !== "day" || calendar.error) return undefined;
  const start = task.start.value;
  const pauses = taskPauses(task);
  const available = (date: string) => isWorkingDate(date, calendar) && !pauses.has(date);
  const endFor = (durationDays: number) => {
    let remaining = Math.ceil((durationDays * 100) / Math.max(1, allocationPercent));
    let value: string | undefined = start;
    for (let scanned = 0; value && scanned < MAX_CALENDAR_DAYS; scanned += 1) {
      if (available(value) && --remaining === 0) return value;
      value = shiftDate(value, 1);
    }
    return undefined;
  };
  const duration = task.duration.value;
  const currentEnd = endFor(duration);
  if (!currentEnd) return undefined;
  // Snap the requested end in the drag direction, then take the first duration that reaches it.
  const direction = requestedCalendarDays < 0 ? -1 : 1;
  let target = shiftDate(currentEnd, requestedCalendarDays);
  for (let scanned = 0; target && !available(target); scanned += 1) {
    if (scanned >= MAX_CALENDAR_DAYS) return undefined;
    target = shiftDate(target, direction);
  }
  if (!target) return undefined;
  let best = { duration, end: currentEnd };
  if (direction > 0)
    // Each extra duration day adds at least one calendar day, so the target is reached within this range.
    for (
      let candidate = duration + 1;
      target > best.end && candidate <= duration + requestedCalendarDays;
      candidate += 1
    ) {
      const end = endFor(candidate);
      if (!end) return undefined;
      best = { duration: candidate, end };
    }
  else
    for (let candidate = duration - 1; candidate >= 1 && best.end > target; candidate -= 1) {
      const end = endFor(candidate);
      if (!end) return undefined;
      best = { duration: candidate, end };
    }
  return {
    calendarDays: daysBetween(currentEnd, best.end),
    durationDelta: best.duration - duration,
    endDate: best.end,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).valueOf() - new Date(`${from}T00:00:00Z`).valueOf()) / DAY_MS);
}
