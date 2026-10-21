import { NextResponse, type NextRequest } from "next/server";
import { memberOrNull } from "@/lib/auth";
import { exchangeCode, saveGoogleToken } from "@/lib/google";

export async function GET(req: NextRequest) {
  const me = await memberOrNull();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));

  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/settings?google=${status}`, req.url));
    res.cookies.delete("g_state");
    return res;
  };

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = req.cookies.get("g_state")?.value;
  if (!code || !state || params.get("state") !== state) return done("error");

  try {
    const { refreshToken, email } = await exchangeCode(code);
    if (!refreshToken) return done("error");
    await saveGoogleToken(me.id, refreshToken, email);
    return done("connected");
  } catch (err) {
    console.error("google callback failed", err instanceof Error ? err.message : "unknown");
    return done("error");
  }
}
