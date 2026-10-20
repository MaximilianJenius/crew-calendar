import { z } from "zod";

/** Longest pasted message or chat export Claude will read. */
export const MAX_MESSAGE_CHARS = 20000;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
// The browser shrinks screenshots before upload; Vercel rejects request bodies over 4.5 MB.
export const MAX_IMAGE_BASE64 = 4 * 1024 * 1024;

export const MAX_EVENTS_PER_SAVE = 20;
export const MAX_TAGS_PER_EVENT = 20;

/** "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" with optional ":ss" (models sometimes add seconds). */
const LocalTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/);

/** An event as the review form edits it: local wall-clock times in the poster's timezone. */
export const DraftEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  start_local: LocalTime,
  end_local: LocalTime.nullable(),
  all_day: z.boolean(),
  location: z.string().max(300).nullable(),
  notes: z.string().max(4000).nullable(),
  attendee_handles: z.array(z.string()).max(MAX_TAGS_PER_EVENT),
});
export type DraftEvent = z.infer<typeof DraftEventSchema>;

export const SaveEventsBody = z.object({
  events: z.array(DraftEventSchema).min(1).max(MAX_EVENTS_PER_SAVE),
});

export const ParseBody = z.object({
  message: z.string().max(MAX_MESSAGE_CHARS).default(""),
  image: z
    .object({ media_type: z.enum(IMAGE_TYPES), data: z.string().max(MAX_IMAGE_BASE64) })
    .nullable()
    .default(null),
});
export type MessageImage = NonNullable<z.infer<typeof ParseBody>["image"]>;

/**
 * What Claude returns. Same fields as DraftEventSchema but without format constraints, which structured
 * output can't enforce; lib/parse.ts normalises the values before they reach the review form.
 */
export const ExtractedEvents = z.object({
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
