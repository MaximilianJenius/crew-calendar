import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

/** Supabase client bound to the signed-in user's cookies. Used only for auth. */
export function createCookieClient(cookies: CookieMethodsServer) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies,
  });
}
