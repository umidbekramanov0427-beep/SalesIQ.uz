-- Platforma -> Botlar: the clients' bot token can be saved from the panel
-- like the staff and monitoring bots (sealed, server-only; platform_private
-- has no access for signed-in people). A saved token wins over the server
-- setting TELEGRAM_BOT_TOKEN. Adds one column only; idempotent.

alter table public.platform_private
  add column if not exists client_bot_token_sealed text;

notify pgrst, 'reload schema';
