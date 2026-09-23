-- Backs the "Operatsiyalar" side of the AmoCRM integration workspace with
-- real, per-organization data: recording-timing preference, active-funnel
-- reconciliation state, an external read-only analytics token, and an
-- outgoing webhook -- the pieces of that screen that don't already have a
-- home in amocrm_connection / amocrm_sync_log.

alter table public.amocrm_connection
  add column if not exists recording_trim_before_answer boolean not null default false,
  add column if not exists active_funnel_ignore_missing boolean not null default true,
  add column if not exists active_funnel_last_check jsonb;

-- External Analytics API: a single read-only token per org that a client
-- can hand to an outside system to pull their own dashboard numbers. Same
-- "RLS enabled, zero client policies" shape as amocrm_connection -- the
-- token itself is only ever handed back once, from a service-role route,
-- never read back from the browser.
create table if not exists public.org_external_api_tokens (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  token text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.org_external_api_tokens enable row level security;

-- Outgoing webhook: where SalesIQ POSTs a finished call analysis for a
-- business's own downstream system to pick up. One per org for now,
-- matching the reference screen's single "add a receiving address" flow.
-- Headers may carry the receiving system's own auth token, so this stays
-- server-only too, same reasoning as the API token above.
create table if not exists public.org_outgoing_webhooks (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  headers jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.org_outgoing_webhooks enable row level security;
