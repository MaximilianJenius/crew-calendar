import { NextResponse } from "next/server";
import { listMembers, memberOrNull } from "@/lib/auth";
import { parseMessage, type MessageImage } from "@/lib/parse";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// The browser shrinks screenshots before upload; Vercel rejects request bodies over 4.5 MB.
const MAX_IMAGE_BASE64 = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const me = await memberOrNull();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json()) as { message?: string; image?: MessageImage | null };
  const text = body.message ?? "";
  const image = body.image ?? null;

  if (!text.trim() && !image) return NextResponse.json({ error: "Paste a message or add a screenshot first" }, { status: 400 });
  if (text.length > 20000) {
    return NextResponse.json({ error: "That message is too long (20,000 characters max)" }, { status: 400 });
  }
  if (image && (!IMAGE_TYPES.includes(image.media_type) || image.data.length > MAX_IMAGE_BASE64)) {
    return NextResponse.json({ error: "Screenshots must be PNG, JPG, WebP or GIF, and not too large" }, { status: 400 });
  }

  try {
    return NextResponse.json(await parseMessage({ text, image }, await listMembers(), me.timezone));
  } catch (err) {
    console.error("parse failed", err);
    const msg = err instanceof Error ? err.message : "Couldn't read that message";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
