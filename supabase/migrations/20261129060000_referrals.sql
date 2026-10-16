-- Referral and partner program (Taklif dasturi). A company shares its link
-- (salesiq.uz/?ref=CODE): the invited company gets extra trial days, and
-- when it first pays the inviting company gets free days. Partners
-- (agencies, consultants) have their own codes and earn a commission on
-- the invited companies' payments. Everything is read and written by the
-- server (service role); browsers get no direct access.

alter table public.organizations
  add column if not exists referral_code text;
create unique index if not exists organizations_referral_code_key
  on public.organizations (referral_code) where referral_code is not null;

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  code text not null,
  commission_pct numeric(5, 2) not null default 20
    check (commission_pct >= 0 and commission_pct <= 100),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists referral_partners_code_key on public.referral_partners (code);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referred_org_id uuid not null references public.organizations(id) on delete cascade,
  referrer_org_id uuid references public.organizations(id) on delete set null,
  partner_id uuid references public.referral_partners(id) on delete set null,
  code text not null,
  status text not null default 'signed_up' check (status in ('signed_up', 'paid')),
  referred_bonus_days integer not null default 0,
  referrer_bonus_days integer not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists referrals_referred_org_key on public.referrals (referred_org_id);
create index if not exists referrals_referrer_idx on public.referrals (referrer_org_id);
create index if not exists referrals_partner_idx on public.referrals (partner_id);

create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.referral_partners(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  payment_id uuid references public.platform_subscription_payments(id) on delete set null,
  amount numeric(14, 2) not null check (amount >= 0),
  paid_out_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists partner_commissions_payment_key
  on public.partner_commissions (payment_id) where payment_id is not null;
create index if not exists partner_commissions_partner_idx on public.partner_commissions (partner_id);

alter table public.referral_partners enable row level security;
alter table public.referrals enable row level security;
alter table public.partner_commissions enable row level security;
revoke all on public.referral_partners, public.referrals, public.partner_commissions
  from anon, authenticated;
grant all on public.referral_partners, public.referrals, public.partner_commissions
  to service_role;
