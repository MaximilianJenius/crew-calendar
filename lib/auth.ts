import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient } from "./supabase/server";
import { db } from "./supabase/admin";
import type { Member, Profile } from "./types";

export async function getAuthUser() {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await db().from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
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
  const { data } = await db()
    .from("profiles")
    .select("id, display_name, handle, timezone")
    .order("display_name");
  return data ?? [];
}
