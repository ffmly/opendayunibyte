import type { TimestampLike } from "@shared/models";

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function tsToDate(ts: TimestampLike | undefined | null): Date | null {
  if (!ts) return null;
  if (typeof ts === "string") {
    const parsed = new Date(ts);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (ts instanceof Date) return ts;
  if (typeof ts === "object" && "toMillis" in ts && typeof ts.toMillis === "function") {
    return new Date(ts.toMillis());
  }
  if (typeof ts === "object" && "seconds" in ts && typeof ts.seconds === "number") {
    return new Date(ts.seconds * 1000);
  }
  return null;
}

export function formatDate(
  ts: TimestampLike | undefined | null,
  lang: string,
): string {
  const d = tsToDate(ts);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat(lang, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function timeAgo(ts: TimestampLike | undefined | null, lang: string): string {
  const d = tsToDate(ts);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (mins < 1) return rtf.format(0, "minute");
  if (mins < 60) return rtf.format(-mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return rtf.format(-days, "day");
}
