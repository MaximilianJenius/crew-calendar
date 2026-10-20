"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

export async function markAllRead() {
  const me = await requireMember();
  await db()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", me.id)
    .is("read_at", null);
  revalidatePath("/");
}
