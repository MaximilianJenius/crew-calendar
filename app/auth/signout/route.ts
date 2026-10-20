import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
