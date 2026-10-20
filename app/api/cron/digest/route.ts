import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { safeEqual } from "@/lib/crypto";
import { listEventsBetween } from "@/lib/events";
import { fetchBusy } from "@/lib/external";
import { emailEnabled, sendEmail } from "@/lib/notify";
import { db, must } from "@/lib/supabase/admin";
import { formatWhen } from "@/lib/time";

export const maxDuration = 60;

/**
 * Daily email (see vercel.json): what each person is tagged in over the next 24 hours,
 * what else the group is doing, and who's busy according to their own calendars.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set; refusing to run the digest");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailEnabled()) return NextResponse.json({ skipped: "email not configured" });

  const from = new Date();
  const to = addDays(from, 1);

  const [everyone, events] = await Promise.all([
    db()
      .from("profiles")
      .select("id, display_name, handle, timezone, email, notify_email, external_ics_url")
      .then(must),
    listEventsBetween(from, to),
  ]);
  const busy = await fetchBusy(everyone, from, to);

  let sent = 0;
  for (const m of everyone) {
    if (!m.notify_email || !m.email) continue;
    const mine = events.filter((e) => e.event_attendees.some((a) => a.user_id === m.id));
    const others = events.filter((e) => !mine.includes(e));
    const othersBusy = busy.filter((b) => b.member.id !== m.id);
    if (!mine.length && !others.length && !othersBusy.length) continue;

    const lines = [
      ...(mine.length ? ["You're in:", ...mine.map((e) => `• ${e.title} — ${formatWhen(e, m.timezone)}`)] : []),
      ...(others.length
        ? ["Also in the group:", ...others.map((e) => `• ${e.title} — ${formatWhen(e, m.timezone)}`)]
        : []),
      ...(othersBusy.length
        ? [
            "Busy on their own calendars:",
            ...othersBusy.map((b) => `• ${b.member.display_name}: ${formatWhen(b, m.timezone)}`),
          ]
        : []),
    ];
    await sendEmail(m.email, `Next 24 hours: ${mine.length} for you, ${others.length} in the group`, lines);
    sent++;
  }
  return NextResponse.json({ sent });
}
