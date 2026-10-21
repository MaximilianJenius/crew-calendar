import "server-only";
import { randomUUID } from "node:crypto";
import { db, must } from "./supabase/admin";
import { pushToGoogle, removeFromGoogle } from "./google";
import { sendEmail } from "./notify";
import { DraftError, draftToInstants, formatWhen } from "./time";
import type { DraftEvent, EventRow, Profile } from "./types";

export type EventWithAttendees = EventRow & { event_attendees: { user_id: string }[] };

/** Events overlapping [from, to), with who's tagged, in start order. */
export async function listEventsBetween(from: Date, to: Date): Promise<EventWithAttendees[]> {
  return must(
    await db()
      .from("events")
      .select("id, title, notes, location, starts_at, ends_at, all_day, timezone, created_by, event_attendees(user_id)")
      .lt("starts_at", to.toISOString())
      .gt("ends_at", from.toISOString())
      .order("starts_at"),
  );
}

/**
 * Saves reviewed events in one insert, so either all of them are saved or none are. Every draft is checked
 * first; a DraftError names the one that's wrong. Then, per event: tags attendees, adds it to Google for
 * anyone connected, and alerts everyone tagged except the poster. Those follow-ups never undo the save.
 */
export async function createEvents(poster: Profile, drafts: DraftEvent[]): Promise<EventRow[]> {
  const rows = drafts.map((draft, i) => {
    try {
      const { starts_at, ends_at } = draftToInstants(draft, poster.timezone);
      return {
        id: randomUUID(),
        title: draft.title.trim(),
        notes: draft.notes?.trim() || null,
        location: draft.location?.trim() || null,
        starts_at: starts_at.toISOString(),
        ends_at: ends_at.toISOString(),
        all_day: draft.all_day,
        timezone: poster.timezone,
        created_by: poster.id,
      };
    } catch (err) {
      if (err instanceof DraftError && drafts.length > 1) throw new DraftError(`Event ${i + 1}: ${err.message}`);
      throw err;
    }
  });

  const events = must(
    await db()
      .from("events")
      .insert(rows)
      .select("id, title, notes, location, starts_at, ends_at, all_day, timezone, created_by"),
  );

  const handlesById = new Map<string, string[]>(rows.map((r, i) => [r.id, drafts[i].attendee_handles]));
  await Promise.all(
    events.map((event) =>
      fanOut(poster, event, handlesById.get(event.id) ?? []).catch((err) =>
        console.error("event follow-up failed", event.id, err instanceof Error ? err.message : "unknown"),
      ),
    ),
  );
  return events;
}

async function fanOut(poster: Profile, event: EventRow, handles: string[]) {
  const client = db();
  const people = handles.length
    ? must(
        await client
          .from("profiles")
          .select("id, display_name, email, timezone, notify_email")
          .in("handle", [...new Set(handles)]),
      )
    : [];

  if (!people.length) return;
  must(await client.from("event_attendees").insert(people.map((p) => ({ event_id: event.id, user_id: p.id }))));

  // Tags are saved first, so every Google copy made below is recorded and can be removed later.
  // Pushes run in parallel; one person's broken connection doesn't stop the rest.
  await Promise.all(
    people.map(async (p) => {
      const googleEventId = await pushToGoogle(p.id, event);
      if (!googleEventId) return;
      must(
        await client
          .from("event_attendees")
          .update({ google_event_id: googleEventId })
          .eq("event_id", event.id)
          .eq("user_id", p.id),
      );
    }),
  );

  const others = people.filter((p) => p.id !== poster.id);
  if (!others.length) return;
  must(
    await client.from("notifications").insert(
      others.map((p) => ({
        user_id: p.id,
        event_id: event.id,
        message: `${poster.display_name} added you to "${event.title}"`,
      })),
    ),
  );
  await Promise.all(
    others
      .filter((p) => p.notify_email && p.email)
      .map((p) =>
        sendEmail(p.email!, `${poster.display_name} added you: ${event.title}`, [
          `${poster.display_name} tagged you in a new event.`,
          event.title,
          formatWhen(event, p.timezone),
          ...(event.location ? [`Where: ${event.location}`] : []),
          ...(event.notes ? [event.notes] : []),
        ]),
      ),
  );
}

export type DeleteResult = "deleted" | "forbidden" | "google_failed";

/**
 * Deletes an event everywhere, including attendees' Google calendars, and tells them.
 * Only the person who added it can delete it. If a Google copy couldn't be removed, the event is kept
 * (with the copies that were removed forgotten) so deleting again can finish the job.
 */
export async function deleteEvent(actor: Profile, eventId: string): Promise<DeleteResult> {
  const client = db();
  const event = must(await client.from("events").select("id, title, created_by").eq("id", eventId).maybeSingle());
  if (!event) return "deleted";
  if (event.created_by !== actor.id) return "forbidden";

  const attendees = must(
    await client.from("event_attendees").select("user_id, google_event_id").eq("event_id", eventId),
  );

  const linked = attendees.filter((a) => a.google_event_id);
  const removed = await Promise.all(linked.map((a) => removeFromGoogle(a.user_id, a.google_event_id!)));
  const done = linked.filter((_, i) => removed[i]).map((a) => a.user_id);
  if (done.length < linked.length) {
    if (done.length) {
      must(
        await client
          .from("event_attendees")
          .update({ google_event_id: null })
          .eq("event_id", eventId)
          .in("user_id", done),
      );
    }
    return "google_failed";
  }

  must(await client.from("events").delete().eq("id", eventId));

  const others = attendees.filter((a) => a.user_id !== actor.id);
  if (others.length) {
    must(
      await client.from("notifications").insert(
        others.map((a) => ({
          user_id: a.user_id,
          event_id: null,
          message: `${actor.display_name} cancelled "${event.title}"`,
        })),
      ),
    );
  }
  return "deleted";
}
