-- Sotuvchining ish Telegram akkaunti (Sozlamalar → «Telegram akkauntim»):
-- each salesperson connects their own work Telegram account (MTProto,
-- services/tg-live); its private chats come into the CRM as leads and the
-- salesperson answers them from the lead card, as themselves.
--
--   telegram_user_accounts    one work account per person (and one person
--                             per account); the session is sealed and the
--                             table is server-only, like marketing_tg_accounts.
--   lead_telegram_user_links  which client chat of which work account is
--                             which lead. Keyed by the account's Telegram id,
--                             so when a work number passes to a new person
--                             the clients stay with their leads.
--   lead_telegram_messages    a new channel 'telegram_user' and the person
--                             whose account carried the message.
--
-- Adds tables and a column, widens one check; nothing is deleted or
-- rewritten. Idempotent.

create table if not exists public.telegram_user_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tg_user_id bigint not null,
  tg_username text,
  tg_name text,
  phone_masked text,
  session_sealed text not null,
  status text not null default 'ok' check (status in ('ok', 'error')),
  last_error text,
  connected_at timestamptz not null default now(),
  last_event_at timestamptz
);
create unique index if not exists telegram_user_accounts_profile_key
  on public.telegram_user_accounts (profile_id);
create unique index if not exists telegram_user_accounts_tg_user_key
  on public.telegram_user_accounts (tg_user_id);
create index if not exists telegram_user_accounts_org_idx
  on public.telegram_user_accounts (organization_id);

alter table public.telegram_user_accounts enable row level security;
revoke all on public.telegram_user_accounts from anon, authenticated;
grant all on public.telegram_user_accounts to service_role;

create table if not exists public.lead_telegram_user_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  account_tg_user_id bigint not null,
  peer_id bigint not null,
  username text,
  name text,
  phone text,
  linked_at timestamptz not null default now(),
  last_inbound_at timestamptz
);
create unique index if not exists lead_telegram_user_links_peer_key
  on public.lead_telegram_user_links (account_tg_user_id, peer_id);
create index if not exists lead_telegram_user_links_lead_idx
  on public.lead_telegram_user_links (lead_id);
create index if not exists lead_telegram_user_links_org_idx
  on public.lead_telegram_user_links (organization_id, linked_at desc);

alter table public.lead_telegram_user_links enable row level security;
drop policy if exists "lead_telegram_user_links_select" on public.lead_telegram_user_links;
create policy "lead_telegram_user_links_select" on public.lead_telegram_user_links
  for select to authenticated
  using (organization_id = public.current_user_org_id());
revoke insert, update, delete on public.lead_telegram_user_links from anon, authenticated;
grant select on public.lead_telegram_user_links to authenticated;
grant all on public.lead_telegram_user_links to service_role;

alter table public.lead_telegram_messages
  add column if not exists via_profile_id uuid references public.profiles(id) on delete set null;
alter table public.lead_telegram_messages
  drop constraint if exists lead_telegram_messages_channel_check;
alter table public.lead_telegram_messages
  add constraint lead_telegram_messages_channel_check
  check (channel in ('telegram', 'instagram', 'telegram_user'));

-- A client writing to a work account shows in an open Inbox at once.
do $$ begin
  alter publication supabase_realtime add table public.lead_telegram_user_links;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication not found';
end $$;

notify pgrst, 'reload schema';
