import { NextResponse, type NextRequest } from "next/server";
import { createCookieClient } from "@/lib/supabase/env";

// Paths that work without a session: login, calendar feeds (opened by calendar apps), cron.
const PUBLIC = ["/login", "/api/feed", "/api/cron"];

/** Keeps the Supabase session fresh and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createCookieClient({
    getAll: () => request.cookies.getAll(),
    setAll: (toSet) => {
      toSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  });

  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return response;

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
