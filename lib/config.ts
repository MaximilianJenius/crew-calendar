import { z } from "zod";

export const DEFAULT_APP_NAME = "Crew Calendar";

/** The group's name, shown in the header, emails and calendar feeds. Safe to use anywhere. */
export const appName = () => process.env.GROUP_NAME || DEFAULT_APP_NAME;

/** Shortest invite code we accept: a short, human-chosen code can be guessed. */
export const MIN_INVITE_CODE_LENGTH = 12;

const ServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.url(),
});
// GROUP_INVITE_CODE, CRON_SECRET and GOOGLE_TOKEN_KEY are checked by the features that use them, so a
// problem with one of them switches that feature off instead of taking the whole site down.

let cached: z.infer<typeof ServerEnv> | null = null;

/** Validated core server environment. Throws a readable error naming every missing or invalid variable. */
export function serverEnv() {
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}
