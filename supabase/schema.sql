-- Crew Calendar schema. Paste into Supabase -> SQL Editor -> Run.
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
  external_ics_url text,
  notify_email boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null,
  source_message text,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);
create index if not exists events_starts_at_idx on events (starts_at);

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
create table if not exists google_tokens (
  user_id uuid primary key references profiles (id) on delete cascade,
  refresh_token text not null,
  google_email text,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table events enable row level security;
alter table event_attendees enable row level security;
alter table notifications enable row level security;
alter table google_tokens enable row level security;
