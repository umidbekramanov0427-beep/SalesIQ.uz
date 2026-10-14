-- Lead chats (Telegram) carry more than text: what the client sends (photo,
-- document, audio, voice, video, sticker) and what the team sends from the
-- lead card are kept by their Telegram file_id, shown in the feed and
-- downloadable through the server. tg_message_id is the message's id in
-- the chat, needed to put a reaction on a client's message; reaction is the
-- emoji the team set. photo_file_id is the client's Telegram profile photo
-- (photo_checked_at: when it was last looked up). lead_last_messages() gives
-- the funnel board each lead's latest chat message in one call; it runs
-- with the caller's rights, so the table's own org policy applies.
alter table public.lead_telegram_messages
  add column if not exists tg_message_id bigint,
  add column if not exists file_kind text,
  add column if not exists file_id text,
  add column if not exists file_name text,
  add column if not exists reaction text;

alter table public.lead_telegram_links
  add column if not exists photo_file_id text,
  add column if not exists photo_checked_at timestamptz;

create index if not exists lead_telegram_messages_lead_created_idx
  on public.lead_telegram_messages (lead_id, created_at desc);

create or replace function public.lead_last_messages(p_lead_ids uuid[])
returns table (
  lead_id uuid,
  direction text,
  text text,
  file_kind text,
  file_name text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.lead_id)
    m.lead_id, m.direction, m.text, m.file_kind, m.file_name, m.created_at
  from public.lead_telegram_messages m
  where m.lead_id = any (p_lead_ids)
  order by m.lead_id, m.created_at desc;
$$;

revoke execute on function public.lead_last_messages(uuid[]) from public, anon;
grant execute on function public.lead_last_messages(uuid[]) to authenticated, service_role;
