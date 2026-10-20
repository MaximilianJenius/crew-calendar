import { subDays } from "date-fns";
import { appName } from "@/lib/config";
import { buildFeed } from "@/lib/ics";
import { db, must } from "@/lib/supabase/admin";
import { FEED_LOOKBACK_DAYS } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Calendar feeds. /api/feed/<feed_token>.ics has the events you're tagged in; /api/feed/<group_feed_token>.ics
 * has every group event. The tokens are the only secret, so they're long, separate and resettable.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/feed/[token]">) {
  const token = (await ctx.params).token.replace(/\.ics$/, "");
  const client = db();
  const [personal, group] = await Promise.all([
    client.from("profiles").select("id, display_name").eq("feed_token", token).maybeSingle().then(must),
    client.from("profiles").select("id, display_name").eq("group_feed_token", token).maybeSingle().then(must),
  ]);
  const me = personal ?? group;
  if (!me) return new Response("Not found", { status: 404 });
  const all = !personal;

  const rows = must(
    await client
      .from("events")
      .select(
        "id, title, notes, location, starts_at, ends_at, all_day, timezone, created_by, event_attendees(user_id, google_event_id, profiles(display_name))",
      )
      .gte("ends_at", subDays(new Date(), FEED_LOOKBACK_DAYS).toISOString())
      .order("starts_at"),
  );

  const events = rows
    .filter((e) => {
      if (all) return true;
      const mine = e.event_attendees.find((a) => a.user_id === me.id);
      // Skip events already added straight to this person's Google Calendar, to avoid doubles.
      return Boolean(mine && !mine.google_event_id);
    })
    .map((e) => ({
      ...e,
      who: e.event_attendees
        .map((a) => a.profiles?.display_name)
        .filter(Boolean)
        .join(", "),
    }));

  const body = buildFeed(all ? appName() : `${appName()} · ${me.display_name}`, events);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${all ? "group" : "mine"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
