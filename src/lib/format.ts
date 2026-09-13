const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBnDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatMoney(amount: number, currency = "৳"): string {
  return `${currency}${amount.toLocaleString("en-US")}`;
}

export function formatMoneyBn(amount: number, currency = "৳"): string {
  return `${currency}${toBnDigits(amount.toLocaleString("en-US"))}`;
}

export const DHAKA_TZ = "Asia/Dhaka";

/** Offset (minutes) of a timezone at a given instant. */
export function tzOffsetMinutes(date: Date, timeZone = DHAKA_TZ): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") === 24 ? 0 : get("hour"),
      get("minute"),
      get("second"),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return 360; // Asia/Dhaka fallback (UTC+6)
  }
}

/** Y-M-D of "now" inside the target timezone. */
export function zonedDateParts(date: Date, timeZone = DHAKA_TZ) {
  const offset = tzOffsetMinutes(date, timeZone);
  const shifted = new Date(date.getTime() + offset * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    offset,
  };
}

/** Build a UTC Date for a wall-clock HH:mm on the timezone's current day. */
export function zonedTimeToUtc(
  hhmm: string,
  base: Date = new Date(),
  timeZone = DHAKA_TZ,
  dayShift = 0,
): Date {
  const [hRaw, mRaw] = hhmm.split(":");
  const h = Math.min(23, Math.max(0, Number.parseInt(hRaw ?? "0", 10) || 0));
  const m = Math.min(59, Math.max(0, Number.parseInt(mRaw ?? "0", 10) || 0));
  const parts = zonedDateParts(base, timeZone);
  const utcMillis = Date.UTC(parts.year, parts.month - 1, parts.day + dayShift, h, m, 0);
  return new Date(utcMillis - parts.offset * 60000);
}

/** Resolve the active daily sale window from admin settings. */
export function resolveWindow(
  startTime: string,
  expiryTime: string,
  now: Date = new Date(),
  timeZone = DHAKA_TZ,
): { start: Date; end: Date } {
  const start = zonedTimeToUtc(startTime, now, timeZone);
  let end = zonedTimeToUtc(expiryTime, now, timeZone);
  if (end.getTime() <= start.getTime()) {
    end = zonedTimeToUtc(expiryTime, now, timeZone, 1);
  }
  return { start, end };
}

export function formatDhaka(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function statusLabel(status: string): string {
  return status
    .split("_")
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");
}

export function statusTone(status: string): "pending" | "ok" | "bad" | "info" {
  if (status.includes("REJECT")) return "bad";
  if (status.includes("PENDING") || status.includes("REVIEW") || status.includes("INFO"))
    return "pending";
  if (status.includes("APPROVED") || status.includes("DELIVERED")) return "ok";
  return "info";
}
