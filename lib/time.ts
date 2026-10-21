import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, addHours, format, parseISO } from "date-fns";

export const DEFAULT_TZ = "Asia/Singapore";
/** How far ahead the home page lists events. */
export const HORIZON_DAYS = 45;
/** How far ahead the home page shows members' busy times. */
export const BUSY_HORIZON_DAYS = 7;
/** How far back calendar feeds include past events. */
export const FEED_LOOKBACK_DAYS = 60;

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Every IANA timezone this runtime knows, for pickers. */
export function timeZoneList(): string[] {
  // Some runtimes list only older names (Asia/Calcutta, Europe/Kiev) while browsers report the current ones.
  const extra = ["UTC", "Asia/Kolkata", "Europe/Kyiv", "Asia/Yangon", "Asia/Kathmandu", "America/Nuuk"];
  return [...new Set([...Intl.supportedValuesOf("timeZone"), ...extra.filter(isValidTimeZone)])].sort();
}

/** "2026-11-01" + n days, as a date string. Pure calendar math, independent of any timezone. */
export function shiftDay(day: string, n: number): string {
  return format(addDays(parseISO(day), n), "yyyy-MM-dd");
}

/**
 * The first instant of `day` in `tz`. Usually local midnight, but where the clocks jump forward at midnight
 * (e.g. America/Santiago) midnight doesn't exist, so it's the first time that does.
 */
export function startOfLocalDay(day: string, tz: string): Date {
  for (let minutes = 0; minutes <= 180; minutes += 30) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const instant = fromZonedTime(`${day}T${hh}:${mm}:00`, tz);
    if (formatInTimeZone(instant, tz, "yyyy-MM-dd") === day) return instant;
  }
  return fromZonedTime(`${day}T00:00:00`, tz);
}

export class DraftError extends Error {}

/** "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD" → "YYYY-MM-DDTHH:mm:ss". */
function normalise(local: string) {
  if (local.length === 10) return `${local}T09:00:00`;
  return local.length === 16 ? `${local}:00` : local.slice(0, 19);
}

/**
 * Turns a wall-clock draft (in `tz`) into UTC start/end instants.
 * Throws DraftError if the end can't be made to follow the start.
 */
export function draftToInstants(
  d: { start_local: string; end_local: string | null; all_day: boolean },
  tz: string,
): { starts_at: Date; ends_at: Date } {
  if (d.all_day) {
    const startDay = d.start_local.slice(0, 10);
    const endDay = (d.end_local ?? d.start_local).slice(0, 10);
    if (endDay < startDay) throw new DraftError("An all-day event can't end before the day it starts.");
    // Stored end is exclusive: local midnight after the last day. Adding the day to the date string (not
    // 24 hours to the instant) keeps this right on days when the clocks change.
    return {
      starts_at: startOfLocalDay(startDay, tz),
      ends_at: startOfLocalDay(shiftDay(endDay, 1), tz),
    };
  }
  const start = normalise(d.start_local);
  const starts_at = fromZonedTime(start, tz);
  if (!d.end_local) return { starts_at, ends_at: addHours(starts_at, 1) };

  const end = normalise(d.end_local);
  let ends_at = fromZonedTime(end, tz);
  if (ends_at < starts_at) {
    // "10pm till 2am": the end is on the next day.
    ends_at = fromZonedTime(`${shiftDay(end.slice(0, 10), 1)}${end.slice(10)}`, tz);
    if (ends_at < starts_at) throw new DraftError("An event can't end before it starts.");
  }
  return { starts_at, ends_at };
}

/** The local date an all-day event starts on, and its last (inclusive) day. */
function allDaySpan(e: { starts_at: string | Date; ends_at: string | Date; timezone: string }) {
  const first = formatInTimeZone(e.starts_at, e.timezone, "yyyy-MM-dd");
  const last = shiftDay(formatInTimeZone(e.ends_at, e.timezone, "yyyy-MM-dd"), -1);
  return { first, last: last < first ? first : last };
}

export function formatWhen(
  e: { starts_at: string | Date; ends_at: string | Date; all_day: boolean; timezone: string },
  viewerTz: string,
) {
  if (e.all_day) {
    const { first, last } = allDaySpan(e);
    const label = (day: string) => format(parseISO(day), "EEE d MMM");
    return first === last ? `${label(first)} · all day` : `${label(first)} – ${label(last)} · all day`;
  }
  const sameDay =
    formatInTimeZone(e.starts_at, viewerTz, "yyyy-MM-dd") === formatInTimeZone(e.ends_at, viewerTz, "yyyy-MM-dd");
  const start = formatInTimeZone(e.starts_at, viewerTz, "EEE d MMM, h:mm a");
  const end = formatInTimeZone(e.ends_at, viewerTz, sameDay ? "h:mm a" : "EEE d MMM, h:mm a");
  return `${start} – ${end}`;
}

/**
 * The day an item is listed under. All-day items keep their own calendar date (an all-day Saturday in
 * Singapore is Saturday for a London viewer too); timed items use the viewer's timezone.
 */
export function dayKey(e: { starts_at: string | Date; all_day: boolean; timezone: string }, viewerTz: string) {
  return formatInTimeZone(e.starts_at, e.all_day ? e.timezone : viewerTz, "yyyy-MM-dd");
}

export function dayLabel(day: string) {
  return format(parseISO(day), "EEEE d MMMM");
}
