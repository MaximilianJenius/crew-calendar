import Link from "next/link";
import { listMembers, requireMember } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { fetchBusy } from "@/lib/external";
import { dayKey, dayLabel, formatWhen } from "@/lib/time";
import type { EventRow } from "@/lib/types";
import { Composer } from "./components/Composer";
import { DeleteEvent } from "./components/DeleteEvent";
import { markAllRead } from "./actions";

type Row = EventRow & { event_attendees: { user_id: string }[] };

type Item =
  | { kind: "event"; at: string; event: Row }
  | { kind: "busy"; at: string; who: string; when: string };

export default async function Home({ searchParams }: PageProps<"/">) {
  const me = await requireMember();
  const view = (await searchParams).view === "mine" ? "mine" : "all";
  const client = db();

  const now = new Date();
  const horizon = new Date(now.getTime() + 45 * 24 * 3600 * 1000);
  const busyHorizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [members, { data: rows }, { data: notices }, { data: withLinks }] = await Promise.all([
    listMembers(),
    client
      .from("events")
      .select("*, event_attendees(user_id)")
      .gt("ends_at", now.toISOString())
      .lt("starts_at", horizon.toISOString())
      .order("starts_at"),
    client.from("notifications").select("*").eq("user_id", me.id).order("created_at", { ascending: false }).limit(8),
    client
      .from("profiles")
      .select("id, display_name, handle, timezone, external_ics_url")
      .not("external_ics_url", "is", null)
      .neq("id", me.id),
  ]);

  const byId = new Map(members.map((m) => [m.id, m]));
  const events = ((rows ?? []) as Row[]).filter(
    (e) => view === "all" || e.event_attendees.some((a) => a.user_id === me.id),
  );
  const busy = view === "all" ? await fetchBusy(withLinks ?? [], now, busyHorizon) : [];

  const items: Item[] = [
    ...events.map((e) => ({ kind: "event" as const, at: e.starts_at, event: e })),
    ...busy.map((b) => ({
      kind: "busy" as const,
      at: b.starts_at,
      who: b.member.display_name,
      when: formatWhen({ ...b, timezone: me.timezone }, me.timezone),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const days = new Map<string, Item[]>();
  for (const it of items) {
    const k = dayKey(it.at < now.toISOString() ? now : it.at, me.timezone);
    days.set(k, [...(days.get(k) ?? []), it]);
  }
  const unread = (notices ?? []).filter((n) => !n.read_at).length;

  return (
    <main className="wrap">
      <header className="top">
        <h1>{process.env.GROUP_NAME ?? "Crew Calendar"}</h1>
        <nav>
          <Link href="/settings">Settings</Link>
          <form action="/auth/signout" method="post">
            <button className="link">Sign out</button>
          </form>
        </nav>
      </header>

      <Composer me={me} members={members} />

      {(notices ?? []).length > 0 && (
        <section className="card">
          <div className="row" style={{ marginBottom: 4 }}>
            <h2 className="grow" style={{ margin: 0 }}>Alerts {unread > 0 && <span className="chip on">{unread} new</span>}</h2>
            {unread > 0 && (
              <form action={markAllRead}>
                <button className="link">Mark all read</button>
              </form>
            )}
          </div>
          {(notices ?? []).map((n) => (
            <div key={n.id} className={`notice ${n.read_at ? "" : "unread"}`}>
              {n.message}
            </div>
          ))}
        </section>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Coming up</h2>
        <div className="tabs">
          <Link href="/" className={view === "all" ? "on" : ""}>Everyone</Link>
          <Link href="/?view=mine" className={view === "mine" ? "on" : ""}>Just me</Link>
        </div>
      </div>

      {days.size === 0 && <p className="muted">Nothing in the next 45 days. Paste a message above to add something.</p>}

      {[...days.entries()].map(([k, list]) => (
        <section key={k}>
          <div className="day">{dayLabel(`${k}T12:00:00Z`, "UTC")}</div>
          {list.map((it, i) =>
            it.kind === "event" ? (
              <article
                key={it.event.id}
                className={`event ${it.event.event_attendees.some((a) => a.user_id === me.id) ? "mine" : ""}`}
              >
                <div className="row">
                  <span className="title grow">{it.event.title}</span>
                  {it.event.created_by === me.id && <DeleteEvent id={it.event.id} title={it.event.title} />}
                </div>
                <div className="meta">
                  {formatWhen(it.event, me.timezone)}
                  {it.event.location && ` · ${it.event.location}`}
                </div>
                <div className="chips" style={{ marginTop: 6 }}>
                  {it.event.event_attendees.map((a) => {
                    const m = byId.get(a.user_id);
                    return m ? (
                      <span key={a.user_id} className={`chip ${a.user_id === me.id ? "me" : ""}`}>
                        {a.user_id === me.id ? "You" : m.display_name}
                      </span>
                    ) : null;
                  })}
                </div>
                {it.event.notes && <div className="meta" style={{ marginTop: 6 }}>{it.event.notes}</div>}
                <div className="meta" style={{ marginTop: 4, fontSize: 13 }}>
                  Added by {byId.get(it.event.created_by)?.display_name ?? "someone"}
                </div>
              </article>
            ) : (
              <article key={`busy-${i}`} className="event busy">
                <span className="title">{it.who} is busy</span>
                <div className="meta">{it.when} · from their own calendar</div>
              </article>
            ),
          )}
        </section>
      ))}
    </main>
  );
}
