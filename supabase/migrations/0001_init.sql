-- supabase/migrations/0001_init.sql
create extension if not exists pgcrypto;

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  company         text not null,
  position        text not null,
  link            text not null,
  description     text,
  source_platform text not null default 'other',
  applied_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- one row per (user, posting URL); basis for dedup
create unique index jobs_user_link_uniq on public.jobs (user_id, link);
create index jobs_user_applied_idx on public.jobs (user_id, applied_at desc);

alter table public.jobs enable row level security;

create policy "select own jobs" on public.jobs
  for select using (auth.uid() = user_id);
create policy "insert own jobs" on public.jobs
  for insert with check (auth.uid() = user_id);
create policy "update own jobs" on public.jobs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own jobs" on public.jobs
  for delete using (auth.uid() = user_id);
