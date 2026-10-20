/**
 * Display formatting for shared instants in the COMPANY timezone (plan §3,
 * §4.5): storage and comparisons are UTC everywhere, and every member reads
 * the same clock because formatting always passes the company's IANA zone to
 * `Intl`. Day-granularity labels ("Due today") are computed against the
 * company-local day boundary, not the browser's.
 */

const DEFAULT_TIMEZONE = "Asia/Dhaka";

export function formatInstant(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDateOnly(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
  }).format(date);
}

/** The company-local calendar day of an instant, as "YYYY-MM-DD". */
function localDayKey(iso: string, timeZone: string): string {
  // en-CA renders dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Overdue", "Due today", "Due tomorrow", or the formatted date. */
export function dueLabel(iso: string, timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return "—";
  const today = localDayKey(now.toISOString(), timeZone);
  const dueDay = localDayKey(due.toISOString(), timeZone);
  if (due.getTime() < now.getTime()) return "Overdue";
  if (dueDay === today) return "Due today";
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (dueDay === localDayKey(tomorrow.toISOString(), timeZone)) return "Due tomorrow";
  return `Due ${formatDateOnly(iso, timeZone)}`;
}

/** "in 3 days", "in 5 hours", "in 12 minutes", or "just now". */
export function relativeFromNow(iso: string, now: Date = new Date()): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const diff = target - now.getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let unit: string;
  if (abs >= day) unit = `${Math.round(abs / day)} day${Math.round(abs / day) === 1 ? "" : "s"}`;
  else if (abs >= hour) unit = `${Math.round(abs / hour)} hour${Math.round(abs / hour) === 1 ? "" : "s"}`;
  else unit = `${Math.max(1, Math.round(abs / minute))} minute${Math.round(abs / minute) === 1 ? "" : "s"}`;

  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

/**
 * The value/step pair for a datetime-local input whose wall clock means
 * company time: the caller composes "YYYY-MM-DDTHH:mm" from the instant in
 * the company zone, submits it as-is, and the server re-interprets it in the
 * same zone — so the round trip never depends on the browser's own timezone.
 */
export function toWallClockInput(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** A wall-clock string offset from an instant by whole days (release presets). */
export function wallClockMinusDays(wallClock: string, days: number): string {
  const asUtc = Date.parse(`${wallClock}Z`);
  if (Number.isNaN(asUtc)) return "";
  const shifted = new Date(asUtc - days * 86_400_000);
  return shifted.toISOString().slice(0, 16);
}
