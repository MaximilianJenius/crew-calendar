"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { normaliseIcsUrl } from "@/lib/external";
import { db } from "@/lib/supabase/admin";

export async function saveProfile(form: FormData) {
  const me = await requireMember();
  const display_name = String(form.get("name") ?? "").trim().slice(0, 40) || me.display_name;
  let timezone = String(form.get("timezone") ?? "").trim() || me.timezone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    timezone = me.timezone;
  }
  await db()
    .from("profiles")
    .update({ display_name, timezone, notify_email: form.get("notify_email") === "on" })
    .eq("id", me.id);
  revalidatePath("/settings");
  redirect("/settings?saved=profile");
}

export async function saveExternalCalendar(form: FormData) {
  const me = await requireMember();
  const raw = String(form.get("url") ?? "").trim();
  const url = raw ? normaliseIcsUrl(raw) : null;
  if (raw && !url) redirect("/settings?saved=badlink");
  await db().from("profiles").update({ external_ics_url: url }).eq("id", me.id);
  revalidatePath("/settings");
  redirect(`/settings?saved=${url ? "link" : "unlinked"}`);
}

/** New secret in the subscribe links; old links stop working. */
export async function resetFeedLinks() {
  const me = await requireMember();
  await db().from("profiles").update({ feed_token: randomBytes(24).toString("hex") }).eq("id", me.id);
  revalidatePath("/settings");
  redirect("/settings?saved=reset");
}

export async function disconnectGoogle() {
  const me = await requireMember();
  await db().from("google_tokens").delete().eq("user_id", me.id);
  revalidatePath("/settings");
  redirect("/settings?google=disconnected");
}
