-- Lightweight contract generation + e-signature (recommendation #4). Admins
-- author a reusable template with {{token}} placeholders (see
-- src/lib/contracts.ts for the merge logic and supported tokens); a rep
-- generates one per lead, gets a public signing link, and the customer
-- signs by typing their full name -- a "simple electronic signature"
-- (name + timestamp + IP), not a qualified/PKI-backed digital signature
-- like Uzbekistan's government E-IMZO. That's a deliberately smaller,
-- fast-to-ship scope; a real E-IMZO integration would be a separate,
-- much larger project.

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  body text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contract_templates enable row level security;

drop policy if exists "contract_templates_select" on public.contract_templates;
create policy "contract_templates_select" on public.contract_templates for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "contract_templates_write" on public.contract_templates;
create policy "contract_templates_write" on public.contract_templates for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

drop trigger if exists set_updated_at on public.contract_templates;
create trigger set_updated_at before update on public.contract_templates
  for each row execute function public.set_updated_at();

-- lead_contracts: one generated (and possibly signed) document per lead.
-- sign_token is the only credential a customer needs to open and sign it --
-- the public /sign/:token page and its two routes (contracts.$token.ts,
-- contracts.$token.sign.ts) look a contract up by this token alone, same
-- pattern as web_forms' slug. It's generated client-side via
-- crypto.randomUUID() (122 bits of randomness -- plenty for an unguessable
-- one-time link), never derived from the lead/contract id.
create table if not exists public.lead_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  template_id uuid references public.contract_templates(id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed')),
  sign_token text not null unique,
  signer_name text,
  signer_ip text,
  signed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_contracts_lead_idx on public.lead_contracts(lead_id, created_at desc);

alter table public.lead_contracts enable row level security;

drop policy if exists "lead_contracts_select" on public.lead_contracts;
create policy "lead_contracts_select" on public.lead_contracts for select to authenticated
  using (organization_id = public.current_user_org_id());

drop policy if exists "lead_contracts_insert" on public.lead_contracts;
create policy "lead_contracts_insert" on public.lead_contracts for insert to authenticated
  with check (organization_id = public.current_user_org_id());

drop policy if exists "lead_contracts_update" on public.lead_contracts;
create policy "lead_contracts_update" on public.lead_contracts for update to authenticated
  using (organization_id = public.current_user_org_id())
  with check (organization_id = public.current_user_org_id());

-- No client-facing select/update policy covers the public signing flow --
-- an anonymous customer has no Supabase session at all, so /sign/:token
-- and the two contracts.$token* routes go through supabaseAdmin (service
-- role) instead, looking the row up by sign_token and never by id.
