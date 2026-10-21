import { NextResponse } from "next/server";
import { withMember } from "@/lib/api";
import { deleteEvent } from "@/lib/events";

export const DELETE = withMember(async (me, _req: Request, ctx: RouteContext<"/api/events/[id]">) => {
  const { id } = await ctx.params;
  const result = await deleteEvent(me, id);
  if (result === "forbidden") {
    return NextResponse.json({ error: "Only the person who added this event can delete it" }, { status: 403 });
  }
  if (result === "google_failed") {
    return NextResponse.json(
      { error: "Couldn't remove it from someone's Google Calendar just now, so it wasn't deleted. Try again shortly." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
});
