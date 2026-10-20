import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import type { DraftEvent, Member } from "./types";

const client = new Anthropic();

const ExtractedEvents = z.object({
  events: z.array(
    z.object({
      title: z.string().describe("Short calendar title, e.g. 'Dinner at Jumbo'"),
      start_local: z
        .string()
        .describe("Local start in the poster's timezone: YYYY-MM-DDTHH:mm, or YYYY-MM-DD if all_day"),
      end_local: z.string().nullable().describe("Local end in the same format, or null if not stated"),
      all_day: z.boolean(),
      location: z.string().nullable(),
      notes: z.string().nullable().describe("Useful details from the message not captured elsewhere"),
      attendee_handles: z
        .array(z.string())
        .describe("Handles (without @) of members this event is for, chosen only from the member list"),
    }),
  ),
  note_to_user: z
    .string()
    .nullable()
    .describe("One short sentence if something was ambiguous and you had to guess, else null"),
});

const SYSTEM = `You turn chat messages (often copied from WhatsApp or Telegram) into calendar events for a small group of friends.

Rules:
- Only create events the message actually describes. If there are none, return an empty list.
- Resolve relative dates ("tmr", "next Fri", "this weekend") against the current date and time you are given. Times are in the poster's timezone.
- If no time is given, make it all-day. If no end time is given, leave end_local null.
- Attendees: the members tagged with @handle, plus members clearly referred to by name. "@all", "@everyone" or "everyone" means every member. Never invent handles.
- Keep titles short and natural. Put the rest (what to bring, cost, links) in notes.`;

export type ParseResult = { events: DraftEvent[]; note: string | null };

export type MessageImage = { media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string };

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
    max_tokens: 16000,
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
    throw new Error("Couldn't read that message. Try trimming it down to the event details.");
  }

  const valid = new Set(members.map((m) => m.handle));
  return {
    events: response.parsed_output.events.map((e) => ({
      ...e,
      attendee_handles: [...new Set(e.attendee_handles.map((h) => h.replace(/^@/, "").toLowerCase()))].filter((h) =>
        valid.has(h),
      ),
    })),
    note: response.parsed_output.note_to_user,
  };
}
