import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { memberOrNull } from "@/lib/auth";
import { googleAuthUrl, googleEnabled } from "@/lib/google";

export async function GET(req: Request) {
  const me = await memberOrNull();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));
  if (!googleEnabled()) return NextResponse.redirect(new URL("/settings?google=off", req.url));

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set("g_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
