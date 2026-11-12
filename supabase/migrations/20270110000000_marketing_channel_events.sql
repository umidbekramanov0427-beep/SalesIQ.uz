-- Marketing -> Kanallar analytics: who joined and who left a channel, and when.
--
--   marketing_channel_events  one row per join / leave: from the platform's bot
--                             (an admin of the channel, Telegram's chat_member
--                             updates) or from the company's Telegram account
--                             (the channel's "recent actions", last 48 hours).
--                             Only the Telegram user id is kept, no names.
--   marketing_channel_days    + joined / left per day: Telegram's own statistics
--                             when the account can read them (counts_source =
--                             'stats'), else the counted events ('events').
--   marketing_channels        + bot_admin, Telegram statistics (tg_stats) and when
--                             they were read.
--   org_general_settings      + marketing_rules (picture interval, refresh rates).
-- Idempotent: safe to run again.

create table if not exists public.marketing_channel_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.marketing_channels(id) on delete cascade,
  at timestamptz not null,
  kind text not null check (kind in ('join', 'leave')),
  tg_user_id bigint not null,
  invite_link text,
  invite_name text,
  source text not null default 'bot' check (source in ('bot', 'account')),
  created_at timestamptz not null default now(),
  unique (channel_id, tg_user_id, kind, at)
);

create index if not exists marketing_channel_events_channel_at_idx
  on public.marketing_channel_events (channel_id, at desc);
create index if not exists marketing_channel_events_org_at_idx
  on public.marketing_channel_events (organization_id, at desc);

alter table public.marketing_channel_days
  add column if not exists joined integer check (joined is null or joined >= 0),
  add column if not exists left_count integer check (left_count is null or left_count >= 0),
  add column if not exists counts_source text check (counts_source in ('stats', 'events'));

alter table public.marketing_channels
  add column if not exists bot_admin boolean,
  add column if not exists tg_stats jsonb,
  add column if not exists tg_stats_at timestamptz,
  add column if not exists tg_stats_error text,
  add column if not exists admin_log_at timestamptz;

-- Marketing users read the events; only the server writes them.
alter table public.marketing_channel_events enable row level security;
drop policy if exists marketing_channel_events_read on public.marketing_channel_events;
create policy marketing_channel_events_read on public.marketing_channel_events
  for select to authenticated
  using (organization_id = public.current_user_org_id() and public.can_use_marketing());
revoke all on public.marketing_channel_events from anon, authenticated;
grant select on public.marketing_channel_events to authenticated;
grant all on public.marketing_channel_events to service_role;

-- Marketing -> Sozlash -> Kuzatuv: how often live streams are pictured and
-- channels re-read (see src/lib/marketing-rules.ts). Saved by the server.
alter table public.org_general_settings
  add column if not exists marketing_rules jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
