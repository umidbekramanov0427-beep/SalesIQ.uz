-- Telegram Mini App: a client opens the business's Mini App, taps "Send my
-- number", Telegram sends the contact to the bot, and a lead appears in
-- that business's CRM. This table remembers which business the client
-- opened the Mini App for between those two steps (the contact message
-- arrives at the bot separately, carrying only the Telegram user id).
-- Written and read only by the server (service role); no client access.

create table if not exists public.tma_lead_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  telegram_user_id bigint not null,
  telegram_name text,
  telegram_username text,
  status text not null default 'pending' check (status in ('pending', 'done')),
  lead_id uuid references public.leads(id) on delete set null,
  duplicate boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_tma_lead_requests_user
  on public.tma_lead_requests(telegram_user_id, created_at desc);

alter table public.tma_lead_requests enable row level security;
