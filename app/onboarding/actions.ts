"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUser, getProfile } from "@/lib/auth";
import { MIN_INVITE_CODE_LENGTH } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { allow, clientIp } from "@/lib/ratelimit";
import { db } from "@/lib/supabase/admin";
import { formText } from "@/lib/form";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/time";

export type JoinState = { error: string | null };

const HOUR = 3600;

export async function joinGroup(_prev: JoinState, form: FormData): Promise<JoinState> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (await getProfile(user.id)) redirect("/");

  const name = formText(form, "name");
  const handle = formText(form, "handle").replace(/^@/, "").toLowerCase();
  const timezone = formText(form, "timezone") || DEFAULT_TZ;
  const invite = formText(form, "invite");

  const expected = process.env.GROUP_INVITE_CODE ?? "";
  if (expected.length < MIN_INVITE_CODE_LENGTH) {
    console.error(`GROUP_INVITE_CODE must be at least ${MIN_INVITE_CODE_LENGTH} characters; joining is disabled`);
    return { error: "Joining is switched off until the group's invite code is set up. Ask whoever runs the site." };
  }

  // Every attempt counts, per account, per network and overall, so the code can't be guessed by brute force.
  const ip = clientIp(await headers());
  const allowed =
    (await allow(`join:user:${user.id}`, 5, HOUR)) &&
    (await allow(`join:ip:${ip}`, 20, HOUR)) &&
    (await allow("join:all", 100, HOUR));
  if (!allowed) return { error: "Too many tries. Wait an hour, then try again." };

  if (!safeEqual(invite, expected)) {
    return { error: "That invite code isn't right. Ask whoever set up the group." };
  }
  if (!name) return { error: "Add your name." };
  if (!/^[a-z0-9_]{2,20}$/.test(handle)) {
    return { error: "Handle: 2–20 characters, lowercase letters, numbers or _." };
  }
  if (["all", "everyone"].includes(handle)) return { error: "That handle is reserved. Pick another." };
  if (!isValidTimeZone(timezone)) return { error: "Pick your timezone from the list." };

  const max = Number(process.env.MAX_MEMBERS ?? 10);
  const { error } = await db().rpc("join_group", {
    p_id: user.id,
    p_display_name: name.slice(0, 40),
    p_handle: handle,
    p_timezone: timezone,
    p_email: user.email ?? null,
    p_max: max,
  });
  if (error) {
    if (error.code === "23505") return { error: `@${handle} is taken. Pick another.` };
    if (error.message.includes("group_full")) return { error: `The group is full (${max} people).` };
    console.error("join failed", error.message);
    return { error: "Couldn't join just now. Try again." };
  }
  redirect("/settings?welcome=1");
}
