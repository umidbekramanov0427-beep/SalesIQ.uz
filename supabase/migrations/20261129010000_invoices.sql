-- Invoices (hisob-faktura) made from a lead, printed as PDF or sent to
-- Didox (the e-invoice operator) -- Admin panel -> Hisob-faktura va Didox.

-- The company's own requisites and numbering.
create table if not exists public.org_invoice_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text not null default '',
  tin text not null default '',
  vat_reg_code text,
  account text,
  bank_mfo text,
  bank_name text,
  address text,
  director text,
  accountant text,
  phone text,
  has_vat boolean not null default true,
  vat_rate numeric(5, 2) not null default 12,
  prefix text not null default 'HF',
  next_number integer not null default 1 check (next_number > 0),
  default_catalog_code text,
  default_catalog_name text,
  default_package_code text,
  default_package_name text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.org_invoice_settings enable row level security;

drop policy if exists org_invoice_settings_select on public.org_invoice_settings;
create policy org_invoice_settings_select on public.org_invoice_settings
  for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists org_invoice_settings_write on public.org_invoice_settings;
create policy org_invoice_settings_write on public.org_invoice_settings
  for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

-- Didox login (TIN + password, the password encrypted by the server) and
-- the cached session token. Server-only: no policy for signed-in users.
create table if not exists public.org_didox_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  tin text not null,
  password_enc text not null,
  token_enc text,
  token_expires_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table public.org_didox_credentials enable row level security;
revoke all on public.org_didox_credentials from anon, authenticated;
grant all on public.org_didox_credentials to service_role;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  number text not null,
  invoice_date date not null default current_date,
  contract_no text,
  contract_date date,
  buyer_name text not null,
  buyer_tin text,
  buyer_address text,
  buyer_account text,
  buyer_bank_mfo text,
  buyer_vat_reg_code text,
  items jsonb not null default '[]',
  has_vat boolean not null default true,
  total numeric(18, 2) not null default 0,
  vat_total numeric(18, 2) not null default 0,
  currency text not null default 'UZS',
  note text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'cancelled')),
  didox_id text,
  didox_status text,
  didox_error text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

create index if not exists invoices_org_created_idx on public.invoices (organization_id, created_at desc);
create index if not exists invoices_lead_idx on public.invoices (lead_id);

alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (organization_id = public.current_user_org_id());

-- Every write (create with the next number, status changes, Didox,
-- delete) goes through the server route /invoice-api, which checks the
-- caller's company and role.
drop policy if exists invoices_update on public.invoices;
drop policy if exists invoices_delete on public.invoices;
revoke insert, update, delete on public.invoices from authenticated;
grant select on public.invoices to authenticated;
grant select on public.org_invoice_settings to authenticated;
grant insert, update on public.org_invoice_settings to authenticated;
grant all on public.invoices, public.org_invoice_settings to service_role;

-- The next invoice number, taken atomically (two people creating invoices
-- at the same moment never get the same number). Server-only.
create or replace function public.claim_invoice_number(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.org_invoice_settings (organization_id)
  values (p_org)
  on conflict (organization_id) do nothing;
  update public.org_invoice_settings
     set next_number = next_number + 1
   where organization_id = p_org
  returning next_number - 1 into n;
  return n;
end;
$$;

revoke execute on function public.claim_invoice_number(uuid) from public, anon, authenticated;
grant execute on function public.claim_invoice_number(uuid) to service_role;
