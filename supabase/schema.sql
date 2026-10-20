-- Crew Calendar schema. Paste into Supabase -> SQL Editor -> Run.
-- Safe to re-run: it also upgrades databases created from an older version of this file.
-- All tables have RLS on with no policies: the browser can't read them directly.
-- The app's server code uses the secret key and checks membership itself.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  handle text not null unique check (handle ~ '^[a-z0-9_]{2,20}$'),
  email text,
  timezone text not null default 'Asia/Singapore',
  feed_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  -- Separate secret for the whole-group feed, so a personal link can't be widened to everyone's events.
  group_feed_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  external_ics_url text,
  notify_email boolean not null default true,
  created_at timestamptz not null default now()
);
alter table profiles add column if not exists group_feed_token text not null unique default encode(gen_random_bytes(24), 'hex');

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_starts_at_idx on events (starts_at);
-- Pasted chats used to be stored here; they were never read back and held other people's messages.
alter table events drop column if exists source_message;

create table if not exists event_attendees (
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  google_event_id text,
  primary key (event_id, user_id)
);
create index if not exists event_attendees_user_idx on event_attendees (user_id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  event_id uuid references events (id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

-- Google refresh tokens live apart from profiles so they're never selected by accident.
-- refresh_token is encrypted by the app (AES-256-GCM, key in GOOGLE_TOKEN_KEY).
create table if not exists google_tokens (
  user_id uuid primary key references profiles (id) on delete cascade,
  refresh_token text not null,
  google_email text,
  updated_at timestamptz not null default now()
);

-- Sliding-window rate limits (invite code guesses, Claude calls, event saves).
create table if not exists rate_limit_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_limit_hits_key_idx on rate_limit_hits (key, at);

alter table profiles enable row level security;
alter table events enable row level security;
alter table event_attendees enable row level security;
alter table notifications enable row level security;
alter table google_tokens enable row level security;
alter table rate_limit_hits enable row level security;

-- Records one hit for `p_key` and returns false if it already had `p_max` hits in the window.
create or replace function hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('rate:' || p_key));
  delete from rate_limit_hits where key = p_key and at < now() - make_interval(secs => p_window_seconds);
  select count(*) into n from rate_limit_hits where key = p_key;
  if n >= p_max then
    return false;
  end if;
  insert into rate_limit_hits (key) values (p_key);
  return true;
end;
$$;

-- Adds a member, refusing once the group is full. The lock makes count-then-insert atomic.
create or replace function join_group(
  p_id uuid, p_display_name text, p_handle text, p_timezone text, p_email text, p_max int
)
returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));
  if (select count(*) from profiles) >= p_max then
    raise exception 'group_full';
  end if;
  insert into profiles (id, display_name, handle, timezone, email)
  values (p_id, p_display_name, p_handle, p_timezone, p_email);
end;
$$;

-- Only the server (secret key) may call these; the publishable key must not.
revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function join_group(uuid, text, text, text, text, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;
grant execute on function join_group(uuid, text, text, text, text, int) to service_role;
