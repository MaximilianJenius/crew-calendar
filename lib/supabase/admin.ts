import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Server-only client with the secret key. Bypasses RLS, so callers must check membership. */
export function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
