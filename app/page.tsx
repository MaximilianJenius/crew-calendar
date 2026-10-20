import Link from "next/link";
import { addDays } from "date-fns";
import { listMembers, requireMember } from "@/lib/auth";
import { appName } from "@/lib/config";
import { listEventsBetween, type EventWithAttendees } from "@/lib/events";
import { fetchBusy, type BusyBlock } from "@/lib/external";
import { db, must } from "@/lib/supabase/admin";
import { BUSY_HORIZON_DAYS, HORIZON_DAYS, dayKey, dayLabel, formatWhen } from "@/lib/time";
import type { Member } from "@/lib/types";
import { Composer } from "./components/Composer";
import { EventCard } from "./components/EventCard";
import { markAllRead } from "./actions";

type Item = { kind: "event"; at: string; event: EventWithAttendees } | { kind: "busy"; at: string; block: BusyBlock };

/** Groups items by the day they're listed under, in date order. Anything already under way shows under today. */
function groupByDay(items: Item[], now: Date, viewerTz: string): [string, Item[]][] {
  const today = dayKey({ starts_at: now, all_day: false, timezone: viewerTz }, viewerTz);
  const days = new Map<string, Item[]>();
  for (const it of items) {
    const subject = it.kind === "event" ? it.event : it.block;
    const k = dayKey(subject, viewerTz);
    const key = k < today ? today : k;
    days.set(key, [...(days.get(key) ?? []), it]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, list]) => [k, list.sort((a, b) => a.at.localeCompare(b.at))]);
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const me = await requireMember();
  const view = (await searchParams).view === "mine" ? "mine" : "all";
  const client = db();

  const now = new Date();
  const [members, rows, notices, withLinks] = await Promise.all([
    listMembers(),
    listEventsBetween(now, addDays(now, HORIZON_DAYS)),
    client
      .from("notifications")
      .select("id, message, read_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(must),
    client
      .from("profiles")
      .select("id, display_name, handle, timezone, external_ics_url")
      .not("external_ics_url", "is", null)
      .neq("id", me.id)
      .then(must),
  ]);

  const byId = new Map<string, Member>(members.map((m) => [m.id, m]));
  const events = rows.filter((e) => view === "all" || e.event_attendees.some((a) => a.user_id === me.id));
  const busy = view === "all" ? await fetchBusy(withLinks, now, addDays(now, BUSY_HORIZON_DAYS)) : [];

  const days = groupByDay(
    [
      ...events.map((e) => ({ kind: "event" as const, at: e.starts_at, event: e })),
      ...busy.map((b) => ({ kind: "busy" as const, at: b.starts_at, block: b })),
    ],
    now,
    me.timezone,
  );
  const unread = notices.filter((n) => !n.read_at).length;

  return (
    <main className="wrap">
      <header className="top">
        <h1>{appName()}</h1>
        <nav>
          <Link href="/settings">Settings</Link>
          <form action="/auth/signout" method="post">
            <button className="link">Sign out</button>
          </form>
        </nav>
      </header>

      <Composer me={me} members={members} />

      {notices.length > 0 && (
        <section className="card">
          <div className="row" style={{ marginBottom: 4 }}>
            <h2 className="grow" style={{ margin: 0 }}>
              Alerts {unread > 0 && <span className="chip on">{unread} new</span>}
            </h2>
            {unread > 0 && (
              <form action={markAllRead}>
                <button className="link">Mark all read</button>
              </form>
            )}
          </div>
          {notices.map((n) => (
            <div key={n.id} className={`notice ${n.read_at ? "" : "unread"}`}>
              {n.message}
            </div>
          ))}
        </section>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Coming up</h2>
        <div className="tabs">
          <Link href="/" className={view === "all" ? "on" : ""}>
            Everyone
          </Link>
          <Link href="/?view=mine" className={view === "mine" ? "on" : ""}>
            Just me
          </Link>
        </div>
      </div>

      {days.length === 0 && (
        <p className="muted">Nothing in the next {HORIZON_DAYS} days. Paste a message above to add something.</p>
      )}

      {days.map(([k, list]) => (
        <section key={k}>
          <div className="day">{dayLabel(k)}</div>
          {list.map((it, i) =>
            it.kind === "event" ? (
              <EventCard key={it.event.id} event={it.event} me={me} byId={byId} />
            ) : (
              <article key={`busy-${i}`} className="event busy">
                <span className="title">{it.block.member.display_name} is busy</span>
                <div className="meta">{formatWhen(it.block, me.timezone)} · from their own calendar</div>
              </article>
            ),
          )}
        </section>
      ))}
    </main>
  );
}
