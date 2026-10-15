-- The platform owner's monitoring bot (src/lib/ops/): one row per report or
-- alert already sent, so the 5-minute cron sends each one once
-- ("daily:<date>", "alert:<issue>:<org>:<date>"). Server-only.
create table if not exists public.platform_ops_log (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.platform_ops_log enable row level security;
revoke all on public.platform_ops_log from anon, authenticated;
grant all on public.platform_ops_log to service_role;
