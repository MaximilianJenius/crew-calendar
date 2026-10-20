import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { formatInTimeZone } from "date-fns-tz";
import { ExtractedEvents, MAX_TAGS_PER_EVENT, type MessageImage } from "./schema";
import type { DraftEvent, Member } from "./types";

const client = new Anthropic();

const SYSTEM = `You turn chat messages (often copied from WhatsApp or Telegram) into calendar events for a small group of friends.

Rules:
- Only create events the message actually describes. If there are none, return an empty list.
- Resolve relative dates ("tmr", "next Fri", "this weekend") against the current date and time you are given. Times are in the poster's timezone.
- If no time is given, make it all-day. If no end time is given, leave end_local null.
- Attendees: the members tagged with @handle, plus members clearly referred to by name. "@all", "@everyone" or "everyone" means every member. Never invent handles.
- Keep titles short and natural. Put the rest (what to bring, cost, links) in notes.`;

export type ParseResult = { events: DraftEvent[]; note: string | null };

/** Error whose message is safe to show the user. */
export class ParseError extends Error {}

/**
 * Coerces the model's local time into what the review form and /api/events expect:
 * "YYYY-MM-DD" for all-day events, "YYYY-MM-DDTHH:mm" otherwise. Returns null if it isn't a date at all.
 */
function toLocal(value: string | null, allDay: boolean): string | null {
  const m = value ? /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value.trim()) : null;
  if (!m) return null;
  if (allDay) return m[1];
  return `${m[1]}T${m[2] ?? "09:00"}`;
}

/** Reads pasted text and/or a screenshot of a chat and returns draft events for review. */
export async function parseMessage(
  input: { text: string; image: MessageImage | null },
  members: Member[],
  posterTz: string,
): Promise<ParseResult> {
  const now = formatInTimeZone(new Date(), posterTz, "EEEE yyyy-MM-dd HH:mm");
  const roster = members.map((m) => `- @${m.handle} (${m.display_name})`).join("\n");

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low", format: betaZodOutputFormat(ExtractedEvents) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...(input.image ? [{ type: "image" as const, source: { type: "base64" as const, ...input.image } }] : []),
          {
            type: "text" as const,
            text:
              `Current date and time for the poster: ${now} (${posterTz})\n\nMembers:\n${roster}\n\n` +
              (input.image ? "The attached screenshot shows the message.\n\n" : "") +
              (input.text.trim() ? `Message:\n<message>\n${input.text}\n</message>` : ""),
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new ParseError("Couldn't read that message. Try trimming it down to the event details.");
  }

  const valid = new Set(members.map((m) => m.handle));
  const events: DraftEvent[] = [];
  for (const e of response.parsed_output.events) {
    const start_local = toLocal(e.start_local, e.all_day);
    if (!start_local) continue;
    events.push({
      ...e,
      title: e.title.slice(0, 200),
      start_local,
      end_local: toLocal(e.end_local, e.all_day),
      attendee_handles: [...new Set(e.attendee_handles.map((h) => h.replace(/^@/, "").toLowerCase()))]
        .filter((h) => valid.has(h))
        .slice(0, MAX_TAGS_PER_EVENT),
    });
  }
  return { events, note: response.parsed_output.note_to_user };
}
