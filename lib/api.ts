import "server-only";
import { NextResponse } from "next/server";
import { memberOrNull } from "./auth";
import type { Profile } from "./types";

/** Wraps an API route handler: 401 for non-members, and JSON (never an HTML error page) for crashes. */
export function withMember<Args extends unknown[]>(
  handler: (me: Profile, ...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      const me = await memberOrNull();
      if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      return await handler(me, ...args);
    } catch (err) {
      console.error("api error", err instanceof Error ? err.message : "unknown");
      return NextResponse.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
    }
  };
}
