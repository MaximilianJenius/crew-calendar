import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { fetchBusy } from "@/lib/external";
import { emailEnabled, sendEmail } from "@/lib/notify";
import { formatWhen } from "@/lib/time";
import type { EventRow } from "@/lib/types";

export const maxDuration = 60;

/**
 * Daily email (see vercel.json): what each person is tagged in over the next 24 hours,
 * what else the group is doing, and who's busy according to their own calendars.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailEnabled()) return NextResponse.json({ skipped: "email not configured" });

  const client = db();
  const from = new Date();
  const to = new Date(from.getTime() + 24 * 3600 * 1000);

  const [{ data: members }, { data: rows }] = await Promise.all([
    client.from("profiles").select("id, display_name, handle, timezone, email, notify_email, external_ics_url"),
    client
      .from("events")
      .select("*, event_attendees(user_id)")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .order("starts_at"),
  ]);
  const everyone = members ?? [];
  const events = (rows ?? []) as (EventRow & { event_attendees: { user_id: string }[] })[];
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
      ...(others.length ? ["Also in the group:", ...others.map((e) => `• ${e.title} — ${formatWhen(e, m.timezone)}`)] : []),
      ...(othersBusy.length
        ? [
            "Busy on their own calendars:",
            ...othersBusy.map(
              (b) => `• ${b.member.display_name}: ${formatWhen({ ...b, timezone: m.timezone }, m.timezone)}`,
            ),
          ]
        : []),
    ];
    await sendEmail(m.email, `Next 24 hours: ${mine.length} for you, ${others.length} in the group`, lines);
    sent++;
  }
  return NextResponse.json({ sent });
}
