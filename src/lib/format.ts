/** 754 -> "12:34", 4000 -> "1:06:40" */
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function formatDate(iso: string, locale = "en-US"): string {
  // Dates are plain ISO days; pin to noon UTC so time zones never shift the day.
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

/** "Nov 3, 2026" in the given locale. */
export function formatShortDate(iso: string, locale = "en-US"): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

export function momentHref(meetingId: string, seconds: number): string {
  return `/meetings/${encodeURIComponent(meetingId)}?t=${Math.floor(seconds)}`;
}
