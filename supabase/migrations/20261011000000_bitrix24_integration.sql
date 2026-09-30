-- Bitrix24 continuous sync (Bitrix24 -> SalesIQ), same shape as the AmoCRM
-- integration (20260809090000_amocrm_integration.sql and its follow-ups)
-- but simpler on the auth side: Bitrix24's "incoming webhook" is a single
-- long-lived URL+token an org's own Bitrix24 admin generates from their
-- portal's own settings (CRM -> Settings -> Developer resources -> Other
-- -> Inbound webhook) -- no OAuth app registration/review, no client
-- secret, no token refresh, unlike AmoCRM's per-org "private integration"
-- OAuth flow. The org pastes that one URL into /integrations and that's
-- the whole connection.

create table if not exists public.bitrix24_connection (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  webhook_url text not null,
  portal_domain text not null,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text,
  sync_in_progress boolean not null default false,
  sync_started_at timestamptz,
  events_registered boolean not null default false
);

-- Same secrecy model as amocrm_connection: RLS on with NO policies at all,
-- so the webhook URL (a bearer credential -- anyone holding it can read/
-- write that Bitrix24 portal's CRM data) is reachable only via the
-- service-role key server-side, never from the browser/anon/authenticated
-- roles.
alter table public.bitrix24_connection enable row level security;

create table if not exists public.bitrix24_sync_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger text not null check (trigger in ('manual', 'cron', 'webhook')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  synced_count integer not null default 0,
  skipped boolean not null default false,
  error text
);

create index if not exists bitrix24_sync_log_org_idx
  on public.bitrix24_sync_log(organization_id, finished_at desc);

alter table public.bitrix24_sync_log enable row level security;

drop policy if exists "bitrix24_sync_log_select" on public.bitrix24_sync_log;
create policy "bitrix24_sync_log_select" on public.bitrix24_sync_log for select to authenticated
  using (organization_id = public.current_user_org_id());

-- Idempotency keys, same pattern as amocrm_id: a unique remote id lets a
-- re-sync of the same Bitrix24 record update it in place instead of
-- creating a duplicate.
alter table public.leads add column if not exists bitrix24_deal_id bigint unique;
alter table public.contacts add column if not exists bitrix24_contact_id bigint unique;

-- Bitrix24's deal STAGE_ID is a string ("C2:NEW", "WON", ...), scoped to a
-- CATEGORY_ID (its term for what this app calls a pipeline/funnel) --
-- unlike AmoCRM's globally-int status_id, so the mapping columns here are
-- typed differently even though they play the exact same role as
-- amocrm_pipeline_id/amocrm_status_id above.
alter table public.pipeline_stages add column if not exists bitrix24_category_id integer;
alter table public.pipeline_stages add column if not exists bitrix24_stage_id text;

drop index if exists pipeline_stages_bitrix24_unique;
create unique index pipeline_stages_bitrix24_unique on public.pipeline_stages
  (organization_id, bitrix24_category_id, bitrix24_stage_id)
  where bitrix24_category_id is not null and bitrix24_stage_id is not null;

-- Matches a Bitrix24 user (ASSIGNED_BY_ID on a deal) to an existing profile
-- by email -- unlike AmoCRM's syncUserMapping, this does NOT auto-provision
-- a new rep account for a Bitrix24 user with no matching profile; a deal
-- assigned to someone not yet on this platform just syncs with owner_id
-- left null rather than silently creating an account with a shared default
-- password.
alter table public.profiles add column if not exists bitrix24_user_id integer;
