-- Mijoz kabineti (amoCRM's client portal): a private link a manager sends
-- to a client. Opening it shows the client their orders (the leads of the
-- same contact), payments and open payment links, invoices and the chat
-- with the company -- read-only, no sign-in. The link is a long random
-- token; one live link per lead, a new one replaces (revokes) the old.
-- The server (service role) creates, revokes and reads the cabinet; the
-- company's people may see which links exist.

create table if not exists public.client_cabinets (
  token text primary key check (length(token) >= 32),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_opened_at timestamptz,
  open_count integer not null default 0
);

create unique index if not exists client_cabinets_live_lead_uniq
  on public.client_cabinets (lead_id) where revoked_at is null;
create index if not exists client_cabinets_org_idx
  on public.client_cabinets (organization_id, created_at desc);

alter table public.client_cabinets enable row level security;

drop policy if exists "client_cabinets_select" on public.client_cabinets;
create policy "client_cabinets_select" on public.client_cabinets for select to authenticated
  using (organization_id = public.current_user_org_id());

notify pgrst, 'reload schema';
