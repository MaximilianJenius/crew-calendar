import { cookies } from "next/headers";
import { createCookieClient } from "./env";

/** Supabase client bound to the signed-in user's cookies. Used only for auth. */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createCookieClient({
    getAll: () => cookieStore.getAll(),
    setAll: (toSet) => {
      try {
        toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      } catch {
        // Called from a Server Component; the proxy refreshes the session instead.
      }
    },
  });
}
