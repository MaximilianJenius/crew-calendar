// Mirrors supabase/schema.sql in the format of `supabase gen types typescript`.
// Regenerate after schema changes: npx supabase gen types typescript --project-id <id> > lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          handle: string;
          email: string | null;
          timezone: string;
          feed_token: string;
          group_feed_token: string;
          external_ics_url: string | null;
          notify_email: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          handle: string;
          email?: string | null;
          timezone?: string;
          feed_token?: string;
          group_feed_token?: string;
          external_ics_url?: string | null;
          notify_email?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          handle?: string;
          email?: string | null;
          timezone?: string;
          feed_token?: string;
          group_feed_token?: string;
          external_ics_url?: string | null;
          notify_email?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          title: string;
          notes: string | null;
          location: string | null;
          starts_at: string;
          ends_at: string;
          all_day: boolean;
          timezone: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          notes?: string | null;
          location?: string | null;
          starts_at: string;
          ends_at: string;
          all_day?: boolean;
          timezone: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          notes?: string | null;
          location?: string | null;
          starts_at?: string;
          ends_at?: string;
          all_day?: boolean;
          timezone?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_attendees: {
        Row: {
          event_id: string;
          user_id: string;
          google_event_id: string | null;
        };
        Insert: {
          event_id: string;
          user_id: string;
          google_event_id?: string | null;
        };
        Update: {
          event_id?: string;
          user_id?: string;
          google_event_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          event_id: string | null;
          message: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_id?: string | null;
          message: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_id?: string | null;
          message?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      google_tokens: {
        Row: {
          user_id: string;
          refresh_token: string;
          google_email: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          refresh_token: string;
          google_email?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          refresh_token?: string;
          google_email?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "google_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_hits: {
        Row: { key: string; at: string };
        Insert: { key: string; at?: string };
        Update: { key?: string; at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      hit_rate_limit: {
        Args: { p_key: string; p_window_seconds: number; p_max: number };
        Returns: boolean;
      };
      join_group: {
        Args: {
          p_id: string;
          p_display_name: string;
          p_handle: string;
          p_timezone: string;
          p_email: string | null;
          p_max: number;
        };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
