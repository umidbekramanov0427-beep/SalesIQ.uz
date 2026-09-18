-- Error logs: a single place to see anything going wrong across the app
-- (client crashes, unhandled rejections, server route failures) so admins
-- can spot and fix issues fast. Always written via the server route using
-- the service role, so it works even before a user is signed in.
-- Run this in the Supabase SQL Editor the same way as the earlier migrations.

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  source text not null default 'client',
  route text,
  user_id uuid references public.profiles(id) on delete set null,
  context jsonb not null default '{}',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.error_logs enable row level security;

drop policy if exists "error_logs_select" on public.error_logs;
create policy "error_logs_select" on public.error_logs
  for select to authenticated using (public.is_admin_or_manager());
drop policy if exists "error_logs_update" on public.error_logs;
create policy "error_logs_update" on public.error_logs
  for update to authenticated using (public.is_admin_or_manager());

create index if not exists error_logs_created_idx on public.error_logs (created_at desc);
create index if not exists error_logs_resolved_idx on public.error_logs (resolved);
