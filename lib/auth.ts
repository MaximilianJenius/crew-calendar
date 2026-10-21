import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient } from "./supabase/server";
import { db, must } from "./supabase/admin";
import type { Member, Profile } from "./types";

export async function getAuthUser() {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

const PROFILE_COLUMNS =
  "id, display_name, handle, email, timezone, feed_token, group_feed_token, external_ics_url, notify_email";

export async function getProfile(userId: string): Promise<Profile | null> {
  return must(await db().from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle());
}

/** For pages: signed in and joined, or redirect to the right step. */
export async function requireMember(): Promise<Profile> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!profile) redirect("/onboarding");
  return profile;
}

/** For API routes: the member, or null (caller returns 401). */
export async function memberOrNull(): Promise<Profile | null> {
  const user = await getAuthUser();
  return user ? getProfile(user.id) : null;
}

export async function listMembers(): Promise<Member[]> {
  return must(await db().from("profiles").select("id, display_name, handle, timezone").order("display_name"));
}
