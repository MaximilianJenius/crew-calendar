import { NextResponse } from "next/server";
import { withMember } from "@/lib/api";
import { listMembers } from "@/lib/auth";
import { ParseError, parseMessage } from "@/lib/parse";
import { allow } from "@/lib/ratelimit";
import { MAX_MESSAGE_CHARS, ParseBody } from "@/lib/schema";

export const maxDuration = 60;

export const POST = withMember(async (me, req: Request) => {
  const parsed = ParseBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.path[0] === "message" && i.code === "too_big");
    return NextResponse.json(
      {
        error: tooLong
          ? `That message is too long (${MAX_MESSAGE_CHARS.toLocaleString("en")} characters max)`
          : "Screenshots must be PNG, JPG, WebP or GIF, and not too large",
      },
      { status: 400 },
    );
  }
  const { message: text, image } = parsed.data;
  if (!text.trim() && !image) {
    return NextResponse.json({ error: "Paste a message or add a screenshot first" }, { status: 400 });
  }
  if (!(await allow(`parse:${me.id}`, 30, 3600)) || !(await allow(`parse-day:${me.id}`, 100, 86400))) {
    return NextResponse.json({ error: "You've read a lot of messages recently. Try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await parseMessage({ text, image }, await listMembers(), me.timezone));
  } catch (err) {
    console.error("parse failed", err instanceof Error ? err.message : "unknown");
    const msg = err instanceof ParseError ? err.message : "Couldn't read that message. Try again in a moment.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
});
