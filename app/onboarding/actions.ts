"use server";

import { redirect } from "next/navigation";
import { getAuthUser, getProfile } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

export type JoinState = { error: string | null };

export async function joinGroup(_prev: JoinState, form: FormData): Promise<JoinState> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (await getProfile(user.id)) redirect("/");

  const name = String(form.get("name") ?? "").trim();
  const handle = String(form.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  const timezone = String(form.get("timezone") ?? "").trim() || "Asia/Singapore";
  const invite = String(form.get("invite") ?? "").trim();

  if (!process.env.GROUP_INVITE_CODE || invite !== process.env.GROUP_INVITE_CODE) {
    return { error: "That invite code isn't right. Ask whoever set up the group." };
  }
  if (!name) return { error: "Add your name." };
  if (!/^[a-z0-9_]{2,20}$/.test(handle)) {
    return { error: "Handle: 2–20 characters, lowercase letters, numbers or _." };
  }
  if (["all", "everyone"].includes(handle)) return { error: "That handle is reserved. Pick another." };
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: "Unknown timezone." };
  }

  const client = db();
  const { count } = await client.from("profiles").select("id", { count: "exact", head: true });
  const max = Number(process.env.MAX_MEMBERS ?? 10);
  if ((count ?? 0) >= max) return { error: `The group is full (${max} people).` };

  const { error } = await client
    .from("profiles")
    .insert({ id: user.id, display_name: name, handle, timezone, email: user.email ?? null });
  if (error) {
    return { error: error.code === "23505" ? `@${handle} is taken. Pick another.` : error.message };
  }
  redirect("/settings?welcome=1");
}
