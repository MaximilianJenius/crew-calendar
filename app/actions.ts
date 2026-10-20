"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { db, must } from "@/lib/supabase/admin";

export async function markAllRead() {
  const me = await requireMember();
  must(
    await db()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", me.id)
      .is("read_at", null),
  );
  revalidatePath("/");
}
