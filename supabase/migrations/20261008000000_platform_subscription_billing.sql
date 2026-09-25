-- Corrects the scope of the 20261006000000 Payme/Click migration: that one
-- let a rep collect payment from a LEAD (a tenant org's own customer),
-- which turned out not to be the actual need -- a tenant's customers pay
-- the tenant directly (outside this platform), never the platform owner.
-- What the platform owner actually needs is for a TENANT ORGANIZATION to
-- pay for its own SalesIQ subscription via Payme/Click, so this drops the
-- lead-level payment tables and replaces them with a platform-level
-- equivalent: one shared Payme/Click merchant account (the platform
-- owner's own), used by every org to renew its subscription.

drop table if exists public.lead_payments;
drop table if exists public.org_payme_credentials;
drop table if exists public.org_click_credentials;

-- The subscription price itself is fine for any authenticated user to
-- read (it's just a price, shown on every org's own /billing page), so it
-- lives on platform_settings, whose select policy already allows that.
alter table public.platform_settings
  add column if not exists subscription_price_uzs bigint not null default 0;

-- The merchant secret keys are not -- a leaked secret key here would let
-- anyone forge "payment confirmed" webhooks against the platform's own
-- revenue, so this gets its own table with a platform_owner-only select
-- policy, unlike platform_settings' select-for-all.
create table if not exists public.platform_payment_credentials (
  id boolean primary key default true,
  payme_merchant_id text,
  payme_secret_key text,
  click_service_id text,
  click_merchant_id text,
  click_secret_key text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint platform_payment_credentials_singleton check (id)
);
insert into public.platform_payment_credentials (id) values (true) on conflict (id) do nothing;

alter table public.platform_payment_credentials enable row level security;

drop policy if exists "platform_payment_credentials_select" on public.platform_payment_credentials;
create policy "platform_payment_credentials_select" on public.platform_payment_credentials
  for select to authenticated using (public.is_platform_owner());

drop policy if exists "platform_payment_credentials_write" on public.platform_payment_credentials;
create policy "platform_payment_credentials_write" on public.platform_payment_credentials
  for all to authenticated
  using (public.is_platform_owner())
  with check (public.is_platform_owner());

-- platform_subscription_payments: one row per generated checkout link, one
-- lead_payments-shaped table but keyed to the paying ORGANIZATION instead
-- of a lead. Same "simple invoicing" shape as before (one row = at most
-- one real Payme/Click transaction), same provider_data jsonb for
-- provider-specific lifecycle state.
create table if not exists public.platform_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
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

create index if not exists platform_subscription_payments_org_idx
  on public.platform_subscription_payments(organization_id, created_at desc);
create index if not exists platform_subscription_payments_provider_txn_idx
  on public.platform_subscription_payments(provider, provider_transaction_id);

alter table public.platform_subscription_payments enable row level security;

drop policy if exists "platform_subscription_payments_select" on public.platform_subscription_payments;
create policy "platform_subscription_payments_select" on public.platform_subscription_payments
  for select to authenticated
  using (organization_id = public.current_user_org_id() or public.is_platform_owner());

drop policy if exists "platform_subscription_payments_insert" on public.platform_subscription_payments;
create policy "platform_subscription_payments_insert" on public.platform_subscription_payments
  for insert to authenticated
  with check (organization_id = public.current_user_org_id());

-- No update/delete policy for clients: status only ever moves pending ->
-- paid/cancelled via the provider's own webhook (service role), which also
-- reactivates the org (sets organizations.active = true and extends
-- trial_ends_at) the moment a payment is actually confirmed -- the whole
-- point of wiring up a real payment processor here instead of the existing
-- manual subscription_requests flow (which still exists as a fallback for
-- an org that would rather pay some other way and ask the platform owner
-- to flip the switch by hand).
