import "server-only";
import { db, must } from "./supabase/admin";

/** Records a hit for `key`; returns false if it already had `max` hits in the last `windowSeconds`. */
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  return must(await db().rpc("hit_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_max: max }));
}

/** Best guess at the caller's IP (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
