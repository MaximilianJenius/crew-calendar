"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteAccount } from "@/lib/account";
import { requireMember } from "@/lib/auth";
import { normaliseIcsUrl } from "@/lib/external";
import { disconnectGoogle as disconnect } from "@/lib/google";
import { createAuthClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { formText } from "@/lib/form";
import { isValidTimeZone } from "@/lib/time";
import type { Database } from "@/lib/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/** Updates the member's profile, then sends them back with a message saying whether it worked. */
async function update(id: string, values: ProfileUpdate, saved: string): Promise<never> {
  const { error } = await db().from("profiles").update(values).eq("id", id);
  if (error) {
    console.error("settings update failed", error.message);
    redirect("/settings?error=save");
  }
  revalidatePath("/settings");
  redirect(`/settings?saved=${saved}`);
}

export async function saveProfile(form: FormData) {
  const me = await requireMember();
  const display_name = formText(form, "name").slice(0, 40) || me.display_name;
  const timezone = formText(form, "timezone");
  if (!isValidTimeZone(timezone)) redirect("/settings?error=timezone");
  await update(me.id, { display_name, timezone, notify_email: form.get("notify_email") === "on" }, "profile");
}

export async function saveExternalCalendar(form: FormData) {
  const me = await requireMember();
  const raw = formText(form, "url");
  const url = raw ? normaliseIcsUrl(raw) : null;
  if (raw && !url) redirect("/settings?error=badlink");
  await update(me.id, { external_ics_url: url }, url ? "link" : "unlinked");
}

/** New secrets in both subscribe links; old links stop working. */
export async function resetFeedLinks() {
  const me = await requireMember();
  await update(
    me.id,
    { feed_token: randomBytes(24).toString("hex"), group_feed_token: randomBytes(24).toString("hex") },
    "reset",
  );
}

export async function disconnectGoogle() {
  const me = await requireMember();
  try {
    await disconnect(me.id);
  } catch (err) {
    console.error("google disconnect failed", err instanceof Error ? err.message : "unknown");
    redirect("/settings?error=save");
  }
  revalidatePath("/settings");
  redirect("/settings?google=disconnected");
}

export async function deleteMyAccount(form: FormData) {
  const me = await requireMember();
  if (formText(form, "confirm_handle").replace(/^@/, "").toLowerCase() !== me.handle) {
    redirect("/settings?error=confirm");
  }
  let result: Awaited<ReturnType<typeof deleteAccount>>;
  try {
    result = await deleteAccount(me);
  } catch (err) {
    console.error("account delete failed", err instanceof Error ? err.message : "unknown");
    redirect("/settings?error=delete");
  }
  if (!result.ok) redirect("/settings?error=delete_google");
  await (await createAuthClient()).auth.signOut();
  redirect("/login");
}
