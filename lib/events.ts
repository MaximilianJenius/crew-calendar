import "server-only";
import { db } from "./supabase/admin";
import { pushToGoogle, removeFromGoogle } from "./google";
import { sendEmail } from "./notify";
import { draftToInstants, formatWhen } from "./time";
import type { DraftEvent, EventRow, Profile } from "./types";

/**
 * Saves one reviewed event, tags its attendees, adds it to Google for anyone connected,
 * and alerts everyone tagged except the poster.
 */
export async function createEvent(poster: Profile, draft: DraftEvent, sourceMessage: string | null) {
  const client = db();
  const { starts_at, ends_at } = draftToInstants(draft, poster.timezone);

  const { data: event, error } = await client
    .from("events")
    .insert({
      title: draft.title.trim(),
      notes: draft.notes?.trim() || null,
      location: draft.location?.trim() || null,
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
      all_day: draft.all_day,
      timezone: poster.timezone,
      source_message: sourceMessage,
      created_by: poster.id,
    })
    .select("*")
    .single<EventRow>();
  if (error || !event) throw new Error(error?.message ?? "Couldn't save the event");

  const { data: attendees } = draft.attendee_handles.length
    ? await client
        .from("profiles")
        .select("id, display_name, email, timezone, notify_email")
        .in("handle", draft.attendee_handles)
    : { data: [] };
  const people = attendees ?? [];

  // Google pushes run in parallel; one person's broken connection doesn't stop the rest.
  const rows = await Promise.all(
    people.map(async (p) => ({
      event_id: event.id,
      user_id: p.id,
      google_event_id: await pushToGoogle(p.id, event),
    })),
  );
  if (rows.length) await client.from("event_attendees").insert(rows);

  const others = people.filter((p) => p.id !== poster.id);
  if (others.length) {
    await client.from("notifications").insert(
      others.map((p) => ({
        user_id: p.id,
        event_id: event.id,
        message: `${poster.display_name} added you to "${event.title}"`,
      })),
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

  return { event, attendeeCount: people.length };
}

/**
 * Deletes an event everywhere, including attendees' Google calendars, and tells them.
 * Only the person who added it can delete it. Returns false if they can't.
 */
export async function deleteEvent(actor: Profile, eventId: string): Promise<boolean> {
  const client = db();
  const { data: event } = await client.from("events").select("*").eq("id", eventId).maybeSingle<EventRow>();
  if (!event) return true;
  if (event.created_by !== actor.id) return false;

  const { data: attendees } = await client
    .from("event_attendees")
    .select("user_id, google_event_id")
    .eq("event_id", eventId);

  await Promise.all(
    (attendees ?? [])
      .filter((a) => a.google_event_id)
      .map((a) => removeFromGoogle(a.user_id, a.google_event_id!)),
  );

  await client.from("events").delete().eq("id", eventId);

  const others = (attendees ?? []).filter((a) => a.user_id !== actor.id);
  if (others.length) {
    await client.from("notifications").insert(
      others.map((a) => ({
        user_id: a.user_id,
        event_id: null,
        message: `${actor.display_name} cancelled "${event.title}"`,
      })),
    );
  }
  return true;
}
