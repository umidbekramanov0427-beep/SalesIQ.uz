-- Payments from a company's own clients, into the company's own Payme /
-- Click merchant account (not the platform's).
--
-- The manager creates a payment link from the lead card and sends it to
-- the client (Telegram, Instagram or copied). The client opens
-- /pay/<link id>, pays with Payme or Click; the provider's callback to
-- /lead-payments/{payme,click}/<organization id> marks the link paid and
-- moves the lead to the company's "paid" stage of its funnel.
--
-- New table names on purpose: 20261008000000 drops the older
-- lead_payments / org_payme_credentials / org_click_credentials and may be
-- re-run by hand.

-- The company's merchant keys, sealed by the server (secret-box). Read
-- only by the server: no policies.
create table if not exists public.org_payment_merchants (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  payme_merchant_id text,
  payme_key_sealed text,
  click_service_id text,
  click_merchant_id text,
  click_key_sealed text,
  -- pipeline name -> stage id a paid lead moves to (unset: the funnel's
  -- won stage).
  paid_stages jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.org_payment_merchants enable row level security;

-- One payment link (one bill) for a lead. provider is whichever gateway
-- the client paid (or is paying) with.
create table if not exists public.lead_payment_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  amount bigint not null check (amount > 0),
  description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  provider text check (provider in ('payme', 'click')),
  provider_transaction_id text,
  provider_data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists lead_payment_links_lead_idx
  on public.lead_payment_links (lead_id, created_at desc);
create index if not exists lead_payment_links_txn_idx
  on public.lead_payment_links (provider, provider_transaction_id);

alter table public.lead_payment_links enable row level security;

-- The company sees its links; creating, paying and cancelling go through
-- the server (the provider's callback is the only way to "paid").
drop policy if exists "lead_payment_links_select" on public.lead_payment_links;
create policy "lead_payment_links_select" on public.lead_payment_links
  for select to authenticated
  using (organization_id = public.current_user_org_id());
