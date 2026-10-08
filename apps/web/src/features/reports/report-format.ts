export function reportLocale(): string {
  return typeof navigator !== "undefined" ? navigator.language : Intl.DateTimeFormat().resolvedOptions().locale;
}

export function reportDate(date?: string, locale = reportLocale()): string {
  return date
    ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${date}T00:00:00Z`),
      )
    : "Unknown";
}
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}
export function safeReportUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
    // Capability-bearing collaboration URLs must never be exported.
    if (/collab|invite|token|secret|capability/i.test(url.href)) return;
    return url.href;
  } catch {
    return;
  }
}
