-- Telegram "hisobotchi_bot": links each admin/manager's profile to a
-- Telegram chat (via a one-time link code sent through the bot), and a
-- config row for the bot's @username (shown in the Settings link UI).
-- Run this in the Supabase SQL Editor the same way as the earlier migrations.

alter table public.profiles add column if not exists telegram_chat_id bigint;
alter table public.profiles add column if not exists telegram_link_code text unique;

insert into public.integration_settings (key, enabled, config) values
  ('telegram_bot', false, '{}')
on conflict (key) do nothing;
