// Bounds apply to imported source as well as visual edits.
export const MAX_SOURCE_CHARS = 500_000;
export const MAX_TASKS = 2_000;
export const MAX_WORK_DAYS = 10_000;
export const MAX_CALENDAR_DAYS = 36_600;
export const MAX_WORKLOAD_CELLS = 100_000;

export function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function shiftIsoDateSafely(value: string, days: number): string | undefined {
  if (!validIsoDate(value) || !Number.isSafeInteger(days) || Math.abs(days) > MAX_CALENDAR_DAYS) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.valueOf())) return undefined;
  const shifted = date.toISOString().slice(0, 10);
  return validIsoDate(shifted) ? shifted : undefined;
}
