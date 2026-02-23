-- GreatMindsAlike Supabase Schema
-- Run this in your Supabase SQL editor

-- Sessions table: one row per game session
create table if not exists sessions (
  id text primary key default gen_random_uuid()::text,
  question text not null,
  status text not null default 'waiting', -- 'waiting' | 'active' | 'revealed'
  created_at timestamptz default now()
);

-- Answers table: one row per participant submission
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references sessions(id) on delete cascade,
  participant_name text not null default 'Anonymous',
  answer text not null,
  submitted_at timestamptz default now()
);

-- Scores table: cumulative leaderboard per session
create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references sessions(id) on delete cascade,
  participant_name text not null,
  total_points integer not null default 0,
  updated_at timestamptz default now(),
  unique(session_id, participant_name)
);

-- Enable Row Level Security (open for demo — restrict in production)
alter table sessions enable row level security;
alter table answers enable row level security;
alter table scores enable row level security;

create policy "allow all sessions" on sessions for all using (true) with check (true);
create policy "allow all answers"  on answers  for all using (true) with check (true);
create policy "allow all scores"   on scores   for all using (true) with check (true);

-- Enable Realtime on answers so the admin screen updates live
alter publication supabase_realtime add table answers;
alter publication supabase_realtime add table sessions;
