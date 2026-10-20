import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "../config";
import type { Database } from "../database.types";

let client: SupabaseClient<Database> | null = null;

/** Server-only client with the secret key. Bypasses RLS, so callers must check membership. */
export function db() {
  client ??= createClient<Database>(serverEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Unwraps a Supabase result, throwing on error so failures never pass as "no rows". */
export function must<R extends { data: unknown; error: { message: string } | null }>(
  res: R,
): R extends { error: null } ? R["data"] : never {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as R extends { error: null } ? R["data"] : never;
}
