import type { Tables } from "./database.types";

export type Profile = Omit<Tables<"profiles">, "created_at">;

export type Member = Pick<Profile, "id" | "display_name" | "handle" | "timezone">;

export type EventRow = Omit<Tables<"events">, "created_at">;

export type { DraftEvent } from "./schema";
