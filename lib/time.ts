import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, addHours } from "date-fns";

/** Turns a wall-clock draft (in `tz`) into UTC start/end instants. */
export function draftToInstants(
  d: { start_local: string; end_local: string | null; all_day: boolean },
  tz: string,
): { starts_at: Date; ends_at: Date } {
  if (d.all_day) {
    const startDay = d.start_local.slice(0, 10);
    const endDay = (d.end_local ?? d.start_local).slice(0, 10);
    const starts_at = fromZonedTime(`${startDay}T00:00:00`, tz);
    // Stored end is exclusive: midnight after the last day.
    const ends_at = addDays(fromZonedTime(`${endDay}T00:00:00`, tz), 1);
    return { starts_at, ends_at };
  }
  const starts_at = fromZonedTime(normalise(d.start_local), tz);
  const ends_at = d.end_local ? fromZonedTime(normalise(d.end_local), tz) : addHours(starts_at, 1);
  return { starts_at, ends_at: ends_at < starts_at ? addHours(starts_at, 1) : ends_at };
}

function normalise(local: string) {
  return local.length === 10 ? `${local}T09:00:00` : local.length === 16 ? `${local}:00` : local;
}

export function formatWhen(e: { starts_at: string | Date; ends_at: string | Date; all_day: boolean; timezone: string }, viewerTz: string) {
  if (e.all_day) {
    const start = formatInTimeZone(e.starts_at, e.timezone, "EEE d MMM");
    const lastDay = addDays(new Date(e.ends_at), -1);
    const end = formatInTimeZone(lastDay, e.timezone, "EEE d MMM");
    return start === end ? `${start} · all day` : `${start} – ${end} · all day`;
  }
  const sameDay =
    formatInTimeZone(e.starts_at, viewerTz, "yyyy-MM-dd") === formatInTimeZone(e.ends_at, viewerTz, "yyyy-MM-dd");
  const start = formatInTimeZone(e.starts_at, viewerTz, "EEE d MMM, h:mm a");
  const end = formatInTimeZone(e.ends_at, viewerTz, sameDay ? "h:mm a" : "EEE d MMM, h:mm a");
  return `${start} – ${end}`;
}

export function dayKey(d: string | Date, tz: string) {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

export function dayLabel(d: string | Date, tz: string) {
  return formatInTimeZone(d, tz, "EEEE d MMMM");
}
