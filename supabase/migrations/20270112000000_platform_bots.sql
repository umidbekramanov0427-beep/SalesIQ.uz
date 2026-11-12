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

notify pgrst, 'reload schema';
