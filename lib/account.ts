import "server-only";
import { deleteEvent } from "./events";
import { disconnectGoogle } from "./google";
import { db, must } from "./supabase/admin";
import type { Profile } from "./types";

/**
 * Deletes a member and everything stored about them. Events they added are cancelled for everyone (removed
 * from attendees' Google calendars, with an alert), since nobody else can manage them afterwards. Their tags
 * on other people's events, notifications, feed links and Google token go with the profile row.
 */
export async function deleteAccount(me: Profile): Promise<{ ok: true } | { ok: false; reason: string }> {
  const mine = must(await db().from("events").select("id").eq("created_by", me.id));
  for (const { id } of mine) {
    if ((await deleteEvent(me, id)) === "google_failed") {
      return { ok: false, reason: "Google Calendar couldn't be reached to remove your events. Try again shortly." };
    }
  }
  await disconnectGoogle(me.id);
  // Removing the auth user cascades to the profile and every table that references it.
  const { error } = await db().auth.admin.deleteUser(me.id);
  if (error) throw new Error(`Couldn't delete auth user: ${error.message}`);
  return { ok: true };
}
