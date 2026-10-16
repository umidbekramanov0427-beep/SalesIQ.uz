-- Instagram Direct in the lead card, next to Telegram.
--
-- A company connects its Instagram professional account once
-- (/integrations/instagram, "Instagram API with Instagram Login"). Every
-- Direct message to that account arrives at /integrations/instagram/webhook:
-- a new sender becomes a lead (source "Instagram"), and the conversation is
-- kept in the same lead chat history as Telegram, marked by `channel`. The
-- team replies from the lead card.

-- The lead chat history gets a channel and the platform's own message id
-- (Instagram "mid"), which keeps a message from being saved twice when
-- Instagram echoes back a reply the team sent.
alter table public.lead_telegram_messages
  add column if not exists channel text not null default 'telegram',
  add column if not exists ext_message_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_telegram_messages_channel_check'
  ) then
    alter table public.lead_telegram_messages
      add constraint lead_telegram_messages_channel_check
      check (channel in ('telegram', 'instagram'));
  end if;
end $$;

create unique index if not exists lead_telegram_messages_ext_uidx
  on public.lead_telegram_messages (ext_message_id)
  where ext_message_id is not null;

-- One connected Instagram account per company. The access token is sealed
-- by the server (secret-box) and never read by the browser: no policies,
-- the app reads the connection's status through /integrations/instagram/account.
create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  ig_user_id text not null unique,
  username text,
  name text,
  picture_url text,
  access_token_sealed text not null,
  token_expires_at timestamptz,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_event_at timestamptz,
  last_error text
);

alter table public.instagram_accounts enable row level security;

-- Which Instagram user (by the account-scoped id Instagram gives them) a
-- lead talks to. One lead <-> one Instagram user per connected account.
create table if not exists public.lead_instagram_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  ig_user_id text not null,
  igsid text not null,
  username text,
  name text,
  photo_url text,
  last_inbound_at timestamptz,
  linked_at timestamptz not null default now(),
  unique (ig_user_id, igsid)
);

create index if not exists lead_instagram_links_org_idx
  on public.lead_instagram_links (organization_id);

alter table public.lead_instagram_links enable row level security;

drop policy if exists "lead_instagram_links_select" on public.lead_instagram_links;
create policy "lead_instagram_links_select" on public.lead_instagram_links
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "lead_instagram_links_delete" on public.lead_instagram_links;
create policy "lead_instagram_links_delete" on public.lead_instagram_links
  for delete to authenticated
  using (organization_id = public.current_user_org_id());

-- Links are created only by the webhook (service role).
