import { db } from "@/lib/supabase/admin";
import { buildFeed } from "@/lib/ics";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = EventRow & {
  event_attendees: { user_id: string; google_event_id: string | null; profiles: { display_name: string } | null }[];
};

/**
 * Personal calendar feed. /api/feed/<token>.ics has the events you're tagged in;
 * add ?all=1 for every group event. The token is the only secret, so it's long and resettable.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/feed/[token]">) {
  const { token } = await ctx.params;
  const client = db();
  const { data: me } = await client
    .from("profiles")
    .select("id, display_name")
    .eq("feed_token", token.replace(/\.ics$/, ""))
    .maybeSingle();
  if (!me) return new Response("Not found", { status: 404 });

  const all = new URL(req.url).searchParams.get("all") === "1";
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();

  const { data: rows } = await client
    .from("events")
    .select("*, event_attendees(user_id, google_event_id, profiles(display_name))")
    .gte("ends_at", since)
    .order("starts_at");

  const events = ((rows ?? []) as unknown as Row[])
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

  const groupName = process.env.GROUP_NAME ?? "Crew Calendar";
  const body = buildFeed(all ? groupName : `${groupName} · ${me.display_name}`, events);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${all ? "group" : "mine"}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
