-- Hisob va to'lov like 5CRM: a company tops up its balance (Click / Payme),
-- then buys seats and modules from it for 3 / 6 / 9 (+1) / 12 (+2) months;
-- with «avto-yangilash» the same purchase repeats from the balance when the
-- period ends. Prices are the platform owner's (platform_settings.
-- billing_catalog). Adds tables, columns and two server-only functions; no
-- existing data is changed. Idempotent.
--
--   org_billing      one row per company: balance, auto-renew, the last
--                    purchase (cart) and its legal-entity details.
--   org_wallet_tx    every top-up, purchase, renewal and owner adjustment
--                    (amount + balance after), readable by the company admin.
--   platform_subscription_payments.purpose / credit_uzs
--                    a payment is a top-up of credit_uzs (the paid amount
--                    minus the payment system's commission).
--   org_modules      more modules can be bought (not only the warehouse);
--                    rows bought here carry note = 'billing'.

-- 1. Balance
create table if not exists public.org_billing (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  balance_uzs bigint not null default 0 check (balance_uzs >= 0),
  auto_renew boolean not null default false,
  cart jsonb not null default '{}'::jsonb,
  legal jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.org_wallet_tx (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount_uzs bigint not null,
  balance_after bigint not null,
  kind text not null check (kind in ('topup', 'purchase', 'renewal', 'adjust', 'refund')),
  provider text,
  payment_id uuid,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists org_wallet_tx_org_idx on public.org_wallet_tx (organization_id, created_at desc);
-- One credit per payment: a webhook delivered twice never doubles a top-up.
create unique index if not exists org_wallet_tx_payment_uidx
  on public.org_wallet_tx (payment_id) where kind = 'topup' and payment_id is not null;

-- The company's admin reads its balance and history; every write is the
-- server's (the functions below), never the browser's.
do $$
declare
  t text;
begin
  foreach t in array array['org_billing', 'org_wallet_tx'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (organization_id = public.current_user_org_id()
                and public.current_user_role() in (''super_admin'', ''platform_owner''))',
      t || '_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- 2. Payments: a top-up and what it credits
do $$
begin
  if to_regclass('public.platform_subscription_payments') is not null then
    alter table public.platform_subscription_payments
      add column if not exists purpose text not null default 'subscription',
      add column if not exists credit_uzs bigint;
    if not exists (select 1 from pg_constraint where conname = 'platform_subscription_payments_purpose_check') then
      alter table public.platform_subscription_payments
        add constraint platform_subscription_payments_purpose_check
        check (purpose in ('subscription', 'topup'));
    end if;
  end if;
end $$;

-- 3. The owner's price list (public, like the tier prices beside it)
alter table public.platform_settings
  add column if not exists billing_catalog jsonb not null default '{}'::jsonb;

-- 4. Modules that can be bought
alter table public.org_modules drop constraint if exists org_modules_module_check;
alter table public.org_modules add constraint org_modules_module_check
  check (module in ('warehouse', 'telephony', 'analytics', 'integrations', 'automation',
                    'bulk', 'forms', 'esign'));

-- 5. Money in: a top-up (or the owner's adjustment). Returns the new balance;
--    the same payment twice only returns the balance.
create or replace function public.billing_credit(
  p_org uuid,
  p_amount bigint,
  p_kind text,
  p_provider text default null,
  p_payment uuid default null,
  p_note text default null,
  p_by uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  bal bigint;
begin
  if p_kind not in ('topup', 'adjust', 'refund') then
    raise exception 'billing_credit: bad kind %', p_kind;
  end if;
  insert into public.org_billing (organization_id) values (p_org) on conflict do nothing;
  if p_payment is not null and exists (
    select 1 from public.org_wallet_tx where payment_id = p_payment and kind = 'topup'
  ) then
    select balance_uzs into bal from public.org_billing where organization_id = p_org;
    return bal;
  end if;
  update public.org_billing
     set balance_uzs = balance_uzs + p_amount, updated_at = now()
   where organization_id = p_org
   returning balance_uzs into bal;
  insert into public.org_wallet_tx
    (organization_id, amount_uzs, balance_after, kind, provider, payment_id, note, created_by)
  values (p_org, p_amount, bal, p_kind, p_provider, p_payment, p_note, p_by);
  return bal;
end;
$$;

-- 6. Money out: a purchase or renewal from the balance, in one transaction:
--    the balance, the history row, the paid period, the seats and the
--    modules. Raises insufficient_balance when the balance is short.
create or replace function public.billing_purchase(
  p_org uuid,
  p_amount bigint,
  p_days integer,
  p_extra_seats integer,
  p_modules text[],
  p_cart jsonb,
  p_kind text default 'purchase',
  p_by uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  bal bigint;
  cur_end timestamptz;
  new_end timestamptz;
  m text;
begin
  if p_kind not in ('purchase', 'renewal') then
    raise exception 'billing_purchase: bad kind %', p_kind;
  end if;
  if p_amount < 0 or p_days <= 0 then
    raise exception 'billing_purchase: bad amount or days';
  end if;
  insert into public.org_billing (organization_id) values (p_org) on conflict do nothing;
  select balance_uzs into bal from public.org_billing where organization_id = p_org for update;
  if bal < p_amount then
    raise exception 'insufficient_balance';
  end if;

  select trial_ends_at into cur_end from public.organizations where id = p_org for update;
  new_end := greatest(now(), coalesce(cur_end, now())) + make_interval(days => p_days);

  update public.org_billing
     set balance_uzs = balance_uzs - p_amount, cart = coalesce(p_cart, '{}'::jsonb), updated_at = now()
   where organization_id = p_org
   returning balance_uzs into bal;
  insert into public.org_wallet_tx
    (organization_id, amount_uzs, balance_after, kind, meta, created_by)
  values (p_org, -p_amount, bal, p_kind,
          coalesce(p_cart, '{}'::jsonb) || jsonb_build_object('until', new_end), p_by);

  update public.organizations
     set active = true, is_trial = false, trial_ends_at = new_end,
         extra_seats = greatest(0, coalesce(p_extra_seats, 0))
   where id = p_org;

  -- Bought modules run until the new end; ones bought earlier and not
  -- chosen now are switched off. Modules the owner granted by hand
  -- (another note) are left alone.
  foreach m in array coalesce(p_modules, '{}'::text[]) loop
    insert into public.org_modules (organization_id, module, enabled, until, note, updated_at)
    values (p_org, m, true, new_end, 'billing', now())
    on conflict (organization_id, module)
    do update set enabled = true, until = excluded.until, note = 'billing', updated_at = now();
  end loop;
  update public.org_modules
     set enabled = false, updated_at = now()
   where organization_id = p_org
     and note = 'billing'
     and not (module = any (coalesce(p_modules, '{}'::text[])));

  return new_end;
end;
$$;

revoke all on function public.billing_credit(uuid, bigint, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.billing_purchase(uuid, bigint, integer, integer, text[], jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.billing_credit(uuid, bigint, text, text, uuid, text, uuid) to service_role;
grant execute on function public.billing_purchase(uuid, bigint, integer, integer, text[], jsonb, text, uuid) to service_role;

notify pgrst, 'reload schema';
