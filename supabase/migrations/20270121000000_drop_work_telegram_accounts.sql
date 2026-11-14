-- Removes the salespeople's work Telegram accounts (20270116000000) and
-- their work groups (20270118000000) completely: the feature was taken out
-- of the app. Their tables, the messages those accounts carried in lead
-- chats ('telegram_user'), the via_profile_id column and the company rule
-- in integration_settings go; the lead chat's channel check is back to
-- ('telegram', 'instagram'). The leads themselves stay.
--
-- DELETES DATA (the work accounts' sessions, links, group messages and
-- 'telegram_user' chat messages). Idempotent.

delete from public.lead_telegram_messages where channel = 'telegram_user';

alter table public.lead_telegram_messages
  drop constraint if exists lead_telegram_messages_channel_check;
alter table public.lead_telegram_messages
  add constraint lead_telegram_messages_channel_check
  check (channel in ('telegram', 'instagram'));
alter table public.lead_telegram_messages drop column if exists via_profile_id;

delete from public.integration_settings where key = 'telegram_user';

drop table if exists public.telegram_user_group_messages;
drop table if exists public.telegram_user_groups;
drop table if exists public.lead_telegram_user_links;
drop table if exists public.telegram_user_accounts;

notify pgrst, 'reload schema';
