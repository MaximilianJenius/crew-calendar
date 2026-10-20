import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { appName } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";
import { db, must } from "./supabase/admin";
import type { EventRow } from "./types";

const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const googleEnabled = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_KEY);
const redirectUri = () => `${process.env.APP_URL}/api/google/callback`;

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

class GoogleTokenError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(`Google token error: ${code} (${status})`);
  }
}

type TokenResponse = { access_token: string; refresh_token?: string; id_token?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse>;
  if (!res.ok || !json.access_token) throw new GoogleTokenError(json.error ?? "unknown", res.status);
  return json as TokenResponse;
}

export async function exchangeCode(code: string) {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  if (tokens.id_token) {
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()) as {
      email?: string;
    };
    email = payload.email ?? null;
  }
  return { refreshToken: tokens.refresh_token, email };
}

/** Stores a user's refresh token, encrypted. */
export async function saveGoogleToken(userId: string, refreshToken: string, email: string | null) {
  must(
    await db()
      .from("google_tokens")
      .upsert({
        user_id: userId,
        refresh_token: encryptSecret(refreshToken),
        google_email: email,
        updated_at: new Date().toISOString(),
      }),
  );
}

async function storedRefreshToken(userId: string): Promise<string | null> {
  const row = must(await db().from("google_tokens").select("refresh_token").eq("user_id", userId).maybeSingle());
  return row ? decryptSecret(row.refresh_token) : null;
}

/**
 * A fresh access token, or null if the user isn't connected. Only a definite "this grant is dead" answer from
 * Google disconnects them; outages and network errors throw so callers can retry instead.
 */
async function accessTokenFor(userId: string): Promise<string | null> {
  const refreshToken = await storedRefreshToken(userId);
  if (!refreshToken) return null;
  try {
    return (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token;
  } catch (err) {
    if (err instanceof GoogleTokenError && err.code === "invalid_grant") {
      // Revoked or expired: forget it so the settings page shows "Connect" again.
      must(await db().from("google_tokens").delete().eq("user_id", userId));
      return null;
    }
    throw err;
  }
}

/** Tells Google to drop the grant. Best effort: a failure here shouldn't keep the user connected. */
async function revoke(refreshToken: string) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    if (!res.ok && res.status !== 400) console.error("google revoke failed", res.status);
  } catch (err) {
    console.error("google revoke failed", err instanceof Error ? err.message : "unknown");
  }
}

/** Revokes access at Google and forgets the token. */
export async function disconnectGoogle(userId: string) {
  const refreshToken = await storedRefreshToken(userId);
  if (refreshToken) await revoke(refreshToken);
  must(await db().from("google_tokens").delete().eq("user_id", userId));
}

function toGoogleEvent(e: EventRow) {
  const when = (d: string) =>
    e.all_day
      ? { date: formatInTimeZone(d, e.timezone, "yyyy-MM-dd") }
      : { dateTime: new Date(d).toISOString(), timeZone: e.timezone };
  return {
    summary: e.title,
    location: e.location ?? undefined,
    description: [e.notes, `Added via ${appName()}: ${process.env.APP_URL}`].filter(Boolean).join("\n\n"),
    start: when(e.starts_at),
    end: when(e.ends_at),
  };
}

const describe = (err: unknown) =>
  err instanceof GoogleTokenError ? `token ${err.status}` : err instanceof Error ? err.message : "unknown";

/** Adds the event to the user's primary Google Calendar. Returns the Google event id, or null if not added. */
export async function pushToGoogle(userId: string, e: EventRow): Promise<string | null> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return null;
    const res = await fetch(EVENTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(toGoogleEvent(e)),
    });
    if (!res.ok) {
      console.error("google insert failed", res.status);
      return null;
    }
    return ((await res.json()) as { id: string }).id;
  } catch (err) {
    console.error("google insert failed", describe(err));
    return null;
  }
}

/**
 * Removes the event from the user's Google Calendar. Returns true once it's gone (or can't exist any more
 * because they disconnected), false if Google couldn't be reached and the caller should try again later.
 */
export async function removeFromGoogle(userId: string, googleEventId: string): Promise<boolean> {
  try {
    const token = await accessTokenFor(userId);
    if (!token) return true;
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(googleEventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok || res.status === 404 || res.status === 410) return true;
    console.error("google delete failed", res.status);
    return false;
  } catch (err) {
    console.error("google delete failed", describe(err));
    return false;
  }
}

export async function isGoogleConnected(userId: string) {
  const data = must(await db().from("google_tokens").select("google_email").eq("user_id", userId).maybeSingle());
  return data ? { email: data.google_email } : null;
}
