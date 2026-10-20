import { NextResponse } from "next/server";
import { z } from "zod";
import { memberOrNull } from "@/lib/auth";
import { createEvent } from "@/lib/events";

export const maxDuration = 60;

const LocalTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/);

const Body = z.object({
  source_message: z.string().max(20000).nullable(),
  events: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        start_local: LocalTime,
        end_local: LocalTime.nullable(),
        all_day: z.boolean(),
        location: z.string().max(300).nullable(),
        notes: z.string().max(4000).nullable(),
        attendee_handles: z.array(z.string()).max(50),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  const me = await memberOrNull();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Some event details are missing or invalid" }, { status: 400 });
  }

  for (const draft of parsed.data.events) {
    await createEvent(me, draft, parsed.data.source_message);
  }
  return NextResponse.json({ saved: parsed.data.events.length });
}
