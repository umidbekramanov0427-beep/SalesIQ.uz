-- AmoCRM one-way sync (AmoCRM -> SalesOS). Run this in the Supabase SQL
-- Editor the same way as the earlier migrations.

-- ---------------------------------------------------------------------
-- Secure token storage. This table has RLS enabled with NO policies,
-- so it is completely inaccessible from the browser/anon/authenticated
-- roles — only server-side code using the service-role key can read or
-- write it. Never add a select/update policy here.
-- ---------------------------------------------------------------------

create table if not exists public.amocrm_connection (
  id boolean primary key default true,
  subdomain text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text,
  constraint amocrm_connection_singleton check (id)
);

alter table public.amocrm_connection enable row level security;

-- ---------------------------------------------------------------------
-- Idempotency keys so re-syncing the same AmoCRM record updates it
-- instead of creating a duplicate.
-- ---------------------------------------------------------------------

alter table public.leads add column if not exists amocrm_id bigint unique;
alter table public.contacts add column if not exists amocrm_id bigint unique;
alter table public.companies add column if not exists amocrm_id bigint unique;

-- ---------------------------------------------------------------------
-- Non-secret status row, readable by the app (client already has a
-- select policy on integration_settings for all authenticated users).
-- ---------------------------------------------------------------------

insert into public.integration_settings (key, enabled, config) values
  ('amocrm', false, '{}')
on conflict (key) do nothing;
