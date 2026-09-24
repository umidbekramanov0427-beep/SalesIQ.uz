-- Real Telegram messaging per lead, built on the platform's existing
-- shared bot (TELEGRAM_BOT_TOKEN) -- the same bot already used for
-- personal chat linking and group notifications (see the 20260919010000
-- migration). A rep generates a one-time code from the lead workspace, the
-- customer sends it to the bot, and that Telegram chat becomes bound to the
-- lead so replies can be sent from -- and logged onto -- that lead going
-- forward.

-- lead_telegram_link_codes: one-time, short-lived code for binding a
-- customer's personal chat to a specific lead. Same shape as
-- telegram_bind_codes (group binding) and profiles.telegram_link_code
-- (personal user binding), but keyed by lead_id instead. Zero client-facing
-- policy on purpose -- generated and consumed only by the /telegram/link-lead
-- route and the webhook, both service role, same as telegram_bind_codes.
create table if not exists public.lead_telegram_link_codes (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null
);

alter table public.lead_telegram_link_codes enable row level security;

-- lead_telegram_links: the actual, live binding once a customer's chat
-- sends a valid code. One lead <-> one Telegram chat at a time in each
-- direction, so a chat can't be silently bound to two leads at once.
create table if not exists public.lead_telegram_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  chat_id bigint not null unique,
  chat_first_name text,
  chat_username text,
  linked_at timestamptz not null default now()
);

alter table public.lead_telegram_links enable row level security;

drop policy if exists "lead_telegram_links_select" on public.lead_telegram_links;
create policy "lead_telegram_links_select" on public.lead_telegram_links for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "lead_telegram_links_delete" on public.lead_telegram_links;
create policy "lead_telegram_links_delete" on public.lead_telegram_links for delete to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert/update policy for clients: a link is only ever created by the
-- webhook (service role) once a valid code is redeemed.

-- lead_telegram_messages: every inbound customer message and outbound rep
-- reply, so the lead workspace can show a real conversation history instead
-- of just the current link status.
create table if not exists public.lead_telegram_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  text text not null,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_telegram_messages_lead_idx
  on public.lead_telegram_messages(lead_id, created_at);

alter table public.lead_telegram_messages enable row level security;

drop policy if exists "lead_telegram_messages_select" on public.lead_telegram_messages;
create policy "lead_telegram_messages_select" on public.lead_telegram_messages for select to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert policy for clients: both directions are written server-side --
-- outbound via /telegram/send-lead-message (service role, after actually
-- calling the Telegram API), inbound via the webhook -- so nothing ever
-- appears here that wasn't actually sent or received.
