import { NextResponse } from "next/server";
import { memberOrNull } from "@/lib/auth";
import { deleteEvent } from "@/lib/events";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/events/[id]">) {
  const me = await memberOrNull();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await deleteEvent(me, id))) {
    return NextResponse.json({ error: "Only the person who added this event can delete it" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
