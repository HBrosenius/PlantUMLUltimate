export function validForecastTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function forecastToday(timeZone = "UTC", now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: validForecastTimeZone(timeZone) ? timeZone : "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function browserForecastTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return validForecastTimeZone(timeZone) ? timeZone : "UTC";
}
