import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "./supabase/admin";
import type { EventRow } from "./types";

const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
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

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${json.error ?? res.status}`);
  return json as { access_token: string; refresh_token?: string; id_token?: string };
}

export async function exchangeCode(code: string) {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  let email: string | null = null;
  if (tokens.id_token) {
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());
    email = payload.email ?? null;
  }
  return { refreshToken: tokens.refresh_token, email };
}

async function accessTokenFor(userId: string): Promise<string | null> {
  const { data } = await db().from("google_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  try {
    return (await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" })).access_token;
  } catch (err) {
    // Revoked or expired: forget it so the settings page shows "Connect" again.
    await db().from("google_tokens").delete().eq("user_id", userId);
    console.error("google refresh failed", userId, err);
    return null;
  }
}

function toGoogleEvent(e: EventRow) {
  const when = (d: string) =>
    e.all_day
      ? { date: formatInTimeZone(d, e.timezone, "yyyy-MM-dd") }
      : { dateTime: new Date(d).toISOString(), timeZone: e.timezone };
  return {
    summary: e.title,
    location: e.location ?? undefined,
    description: [e.notes, `Added via ${process.env.GROUP_NAME ?? "Crew Calendar"}: ${process.env.APP_URL}`]
      .filter(Boolean)
      .join("\n\n"),
    start: when(e.starts_at),
    end: when(e.ends_at),
  };
}

/** Adds the event to the user's primary Google Calendar. Returns the Google event id, or null if not connected. */
export async function pushToGoogle(userId: string, e: EventRow): Promise<string | null> {
  const token = await accessTokenFor(userId);
  if (!token) return null;
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(e)),
  });
  if (!res.ok) {
    console.error("google insert failed", userId, res.status, await res.text());
    return null;
  }
  return (await res.json()).id as string;
}

export async function removeFromGoogle(userId: string, googleEventId: string) {
  const token = await accessTokenFor(userId);
  if (!token) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function isGoogleConnected(userId: string) {
  const { data } = await db().from("google_tokens").select("google_email").eq("user_id", userId).maybeSingle();
  return data ? { email: data.google_email as string | null } : null;
}
