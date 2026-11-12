-- The platform's three Telegram bots (Platforma -> Botlar): the client bot
-- (TELEGRAM_BOT_TOKEN on the server), the staff bot and the monitoring bot,
-- whose tokens may be saved from the panel instead of the server settings.
--
--   platform_private    one server-only row (no access for signed-in people,
--                       unlike platform_settings which everyone may read):
--                       the sealed bot tokens and the backup channel's
--                       one-time bind code.
--   telegram_chat_bots  who talks to the staff bot, so their messages go
--                       through it.
--   org_general_settings.backup_rules  a company's own daily backup to its
--                       Telegram group (Admin -> Zaxira): on/off, time, chat.
--   site_tracking       a company's website counter (Marketing -> Sozlash ->
--                       Manbalar -> Sayt): the public key in its snippet.
--   site_visits         one row per page view on the company's site (no
--                       personal data: a random visitor id, the page, the
--                       referrer and UTM tags); lead_id once they leave a
--                       phone. Rows older than 180 days are removed by pg_cron.
-- The backup bind code moves here from platform_settings; the old columns
-- are emptied (a code lives 15 minutes) and left unused.
-- Idempotent: safe to run again.

create table if not exists public.platform_private (
  id boolean primary key default true,
  staff_bot_token_sealed text,
  ops_bot_token_sealed text,
  backup_bind_code text,
  backup_bind_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint platform_private_singleton check (id)
);
insert into public.platform_private (id) values (true) on conflict (id) do nothing;

alter table public.platform_private enable row level security;
revoke all on public.platform_private from anon, authenticated;
grant all on public.platform_private to service_role;

update public.platform_settings
set backup_bind_code = null, backup_bind_expires_at = null
where backup_bind_code is not null or backup_bind_expires_at is not null;

create table if not exists public.telegram_chat_bots (
  chat_id bigint primary key,
  bot text not null check (bot in ('staff')),
  updated_at timestamptz not null default now()
);

alter table public.telegram_chat_bots enable row level security;
revoke all on public.telegram_chat_bots from anon, authenticated;
grant all on public.telegram_chat_bots to service_role;

alter table public.org_general_settings
  add column if not exists backup_rules jsonb not null default '{}'::jsonb;

create table if not exists public.site_tracking (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  key text not null unique check (key ~ '^[A-Za-z0-9]{16,40}$'),
  capture_forms boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  at timestamptz not null default now(),
  visitor_id text not null check (length(visitor_id) between 8 and 64),
  session_id text check (session_id is null or length(session_id) between 8 and 64),
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text check (device is null or device in ('mobile', 'desktop', 'tablet')),
  lead_id uuid references public.leads(id) on delete set null
);
create index if not exists site_visits_org_at_idx on public.site_visits (organization_id, at desc);
create index if not exists site_visits_visitor_idx on public.site_visits (organization_id, visitor_id);

do $$
declare
  t text;
begin
  foreach t in array array['site_tracking', 'site_visits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id = public.current_user_org_id() and public.can_use_marketing())',
      t || '_read', t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Page views older than 180 days are not kept.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'site-visits-purge';
    perform cron.schedule(
      'site-visits-purge',
      '17 3 * * *',
      $job$delete from public.site_visits where at < now() - interval '180 days'$job$
    );
  end if;
end $$;

notify pgrst, 'reload schema';
