-- Marketing boti: a company's own Telegram bot for the marketing panel,
-- separate from its CRM bot. Idempotent; nothing is deleted.
--
-- 1. marketing_bots: the bot (token sealed by the server), its webhook
--    secret and settings (alerts, auto-approving join requests).
-- 2. marketing_bot_staff / marketing_bot_link_codes: which marketing
--    people opened the bot (live console, /holat, alerts and reports go to
--    them); a one-time code links a person's Telegram chat.
-- 3. marketing_bot_log: alerts already sent (each once).
-- 4. Channel analytics through the bot as the channel's admin:
--    marketing_channel_invites -- invite links made per campaign, so joins
--    are counted by link; marketing_channel_posts -- reactions per channel
--    post; join requests are kept as events of kind 'request'.
-- Bot tables are server-only; invites and posts are read by marketing
-- people of the company.

-- 1
create table if not exists public.marketing_bots (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  bot_user_id bigint,
  username text not null,
  token_sealed text not null,
  webhook_secret text not null,
  settings jsonb not null default '{}'::jsonb,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_bots_bot_user_key
  on public.marketing_bots (bot_user_id) where bot_user_id is not null;

-- 2
create table if not exists public.marketing_bot_staff (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chat_id bigint not null,
  tg_username text,
  linked_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create table if not exists public.marketing_bot_link_codes (
  code text primary key check (length(code) between 6 and 40),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);

-- 3
create table if not exists public.marketing_bot_log (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (length(key) <= 200),
  sent_at timestamptz not null default now(),
  primary key (organization_id, key)
);

-- 4
create table if not exists public.marketing_channel_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.marketing_channels(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 32),
  link text not null check (length(link) <= 200),
  join_request boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (channel_id, link)
);

create table if not exists public.marketing_channel_posts (
  channel_id uuid not null references public.marketing_channels(id) on delete cascade,
  message_id bigint not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  posted_at timestamptz,
  text text check (text is null or length(text) <= 300),
  reactions jsonb not null default '{}'::jsonb,
  reactions_total integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (channel_id, message_id)
);
create index if not exists marketing_channel_posts_org_idx
  on public.marketing_channel_posts (organization_id, posted_at desc);

alter table public.marketing_channel_events
  drop constraint if exists marketing_channel_events_kind_check;
alter table public.marketing_channel_events
  add constraint marketing_channel_events_kind_check check (kind in ('join', 'leave', 'request'));

alter table public.marketing_channels
  add column if not exists via_marketing_bot boolean not null default false;

do $$
declare
  t text;
begin
  foreach t in array array[
    'marketing_bots', 'marketing_bot_staff', 'marketing_bot_link_codes', 'marketing_bot_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['marketing_channel_invites', 'marketing_channel_posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id = public.current_user_org_id() and public.can_use_marketing())',
      t || '_read', t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
