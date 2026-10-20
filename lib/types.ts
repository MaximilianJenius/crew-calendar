export type Profile = {
  id: string;
  display_name: string;
  handle: string;
  email: string | null;
  timezone: string;
  feed_token: string;
  external_ics_url: string | null;
  notify_email: boolean;
};

export type Member = Pick<Profile, "id" | "display_name" | "handle" | "timezone">;

export type EventRow = {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  timezone: string;
  created_by: string;
};

/** An event as the review form edits it: local wall-clock times in the poster's timezone. */
export type DraftEvent = {
  title: string;
  start_local: string; // "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" when all_day
  end_local: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  attendee_handles: string[];
};
