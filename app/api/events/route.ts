import { NextResponse } from "next/server";
import { withMember } from "@/lib/api";
import { createEvents } from "@/lib/events";
import { allow } from "@/lib/ratelimit";
import { SaveEventsBody } from "@/lib/schema";
import { DraftError } from "@/lib/time";

export const maxDuration = 60;

export const POST = withMember(async (me, req: Request) => {
  const parsed = SaveEventsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Some event details are missing or invalid" }, { status: 400 });
  }
  if (!(await allow(`save:${me.id}`, 30, 3600))) {
    return NextResponse.json({ error: "You've added a lot of events this hour. Try again later." }, { status: 429 });
  }

  try {
    const saved = await createEvents(me, parsed.data.events);
    return NextResponse.json({ saved: saved.length });
  } catch (err) {
    if (err instanceof DraftError) return NextResponse.json({ error: err.message, saved: 0 }, { status: 400 });
    console.error("save failed", err instanceof Error ? err.message : "unknown");
    // createEvents inserts all rows in one statement, so a failure here means nothing was saved.
    return NextResponse.json({ error: "Couldn't save. Nothing was added; try again.", saved: 0 }, { status: 500 });
  }
});
