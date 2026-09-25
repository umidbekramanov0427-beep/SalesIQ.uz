-- Payme + Click online payment links per lead (recommendation #5) -- a
-- pure-Uzbekistan opportunity the research report flagged as something
-- neither Bitrix24 nor AmoCRM offers natively. Uzcard itself has no
-- separate merchant checkout API of its own (Uzcard-issued cards are
-- processed through Payme/Click's own card rails), so this covers the two
-- gateways that actually have one.
--
-- Both webhooks below are implemented from Payme's/Click's publicly
-- documented merchant protocols (JSON-RPC 2.0 for Payme; signed
-- form-encoded callbacks for Click) -- this sandbox has no network access
-- to either provider, so an org connecting real credentials should run a
-- test payment against the provider's own sandbox before relying on it in
-- production.

create table if not exists public.org_payme_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  merchant_id text not null,
  secret_key text not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.org_payme_credentials enable row level security;

drop policy if exists "org_payme_credentials_select" on public.org_payme_credentials;
create policy "org_payme_credentials_select" on public.org_payme_credentials for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- No client-facing write policy: credentials (including the secret key)
-- are only ever written by /integrations/payme/credentials, service role
-- after its own requireSuperAdmin check -- same treatment as
-- org_whatsapp_credentials/org_sms_credentials.

create table if not exists public.org_click_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  service_id text not null,
  merchant_id text not null,
  secret_key text not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.org_click_credentials enable row level security;

drop policy if exists "org_click_credentials_select" on public.org_click_credentials;
create policy "org_click_credentials_select" on public.org_click_credentials for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- lead_payments: one row per generated payment link/invoice. One row is
-- treated as one real-world Payme/Click transaction (a simple-invoicing
-- shape, not a marketplace with several parallel transactions per order),
-- so each provider's own transaction lifecycle (Payme's create/perform/
-- cancel states and timestamps, Click's prepare id) is kept in
-- provider_data rather than a separate per-provider transactions table.
create table if not exists public.lead_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider text not null check (provider in ('payme', 'click')),
  amount bigint not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  pay_url text not null default '',
  provider_transaction_id text,
  provider_data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists lead_payments_lead_idx on public.lead_payments(lead_id, created_at desc);
create index if not exists lead_payments_provider_txn_idx on public.lead_payments(provider, provider_transaction_id);

alter table public.lead_payments enable row level security;

drop policy if exists "lead_payments_select" on public.lead_payments;
create policy "lead_payments_select" on public.lead_payments for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "lead_payments_insert" on public.lead_payments;
create policy "lead_payments_insert" on public.lead_payments for insert to authenticated
  with check (organization_id = public.current_user_org_id());

-- No update/delete policy for clients: status only ever moves from
-- 'pending' to 'paid'/'cancelled' via the provider's own webhook
-- (payments.payme.webhook.ts / payments.click.webhook.ts, service role),
-- once the provider itself confirms the transaction -- never by a rep
-- marking it manually, so the paid/unpaid state stays trustworthy.
