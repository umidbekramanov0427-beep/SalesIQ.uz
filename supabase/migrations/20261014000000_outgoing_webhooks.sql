-- The "Chiquvchi integratsiyalar" (Outgoing integrations) tab's "Tashqi
-- webhooklar" card: an org can register multiple destination URLs, each
-- subscribed to a subset of real platform events (a PBX call was logged, a
-- recording became available, AI call analysis finished), with its own
-- custom HTTP headers. A delivery row is written for every attempt (sent or
-- failed) so the card's "Yuborish tarixi" is a real log, not a cosmetic
-- placeholder. Named org_webhook_destinations (not org_outgoing_webhooks --
-- that name is already taken by the single-webhook-per-org table backing
-- the Operatsiyalar tab's AmoCRM-call-analysis webhook).
create table if not exists public.org_webhook_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  enabled boolean not null default true,
  events jsonb not null default '[]'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists org_webhook_destinations_org_idx
  on public.org_webhook_destinations(organization_id);

alter table public.org_webhook_destinations enable row level security;

drop policy if exists "org_webhook_destinations_select" on public.org_webhook_destinations;
create policy "org_webhook_destinations_select" on public.org_webhook_destinations for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
drop policy if exists "org_webhook_destinations_write" on public.org_webhook_destinations;
create policy "org_webhook_destinations_write" on public.org_webhook_destinations for all to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager())
  with check (organization_id = public.current_user_org_id() and public.is_admin_or_manager());

create table if not exists public.org_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.org_webhook_destinations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event text not null,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  response_code integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists org_webhook_deliveries_org_idx
  on public.org_webhook_deliveries(organization_id, created_at desc);

alter table public.org_webhook_deliveries enable row level security;

drop policy if exists "org_webhook_deliveries_select" on public.org_webhook_deliveries;
create policy "org_webhook_deliveries_select" on public.org_webhook_deliveries
  for select to authenticated
  using (organization_id = public.current_user_org_id() and public.is_admin_or_manager());
-- No insert/update policy for clients: every delivery row is written by
-- the dispatcher itself (service role) right after it actually attempts
-- the HTTP call, success or failure.
