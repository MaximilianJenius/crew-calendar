import "server-only";
import ical, { ICalAlarmType } from "ical-generator";
import { formatInTimeZone } from "date-fns-tz";
import type { EventRow } from "./types";

/**
 * Builds a subscribable calendar. Every calendar app (Google, Yahoo, iPhone, Android, Outlook)
 * can subscribe to this by URL and will pick up new events on its own refresh schedule.
 */
export function buildFeed(name: string, events: (EventRow & { who?: string })[]) {
  const cal = ical({ name, ttl: 60 * 15 });
  for (const e of events) {
    const allDayDate = (d: string) => new Date(`${formatInTimeZone(d, e.timezone, "yyyy-MM-dd")}T00:00:00Z`);
    cal.createEvent({
      id: `${e.id}@crew-calendar`,
      summary: e.title,
      description: [e.who ? `With: ${e.who}` : null, e.notes].filter(Boolean).join("\n\n") || undefined,
      location: e.location ?? undefined,
      allDay: e.all_day,
      ...(e.all_day
        ? { start: allDayDate(e.starts_at), end: allDayDate(e.ends_at), timezone: "UTC" }
        : { start: new Date(e.starts_at), end: new Date(e.ends_at) }),
      url: process.env.APP_URL,
      alarms: e.all_day ? [] : [{ type: ICalAlarmType.display, trigger: 30 * 60 }],
    });
  }
  return cal.toString();
}
